package launch

// AI のコンテキストの大きさ: Claude Code の会話の記録（transcript の jsonl）から、今のコンテキストの量と、AI の側の物差し（自動で縮める所、無ければモデルの上限）を読む。
// 会話の記録の形・設定の項目の読み方は Claude Code が公式に約束した物ではないので、頼る所はこのファイルの名前の付いた関数に閉じ、根拠を書く

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// ContextUse は、会話 1 つの今のコンテキストの量（Used。トークン）と、AI の側の物差し（AIScale。トークン）
type ContextUse struct {
	Used    int64
	AIScale int64
}

// NoContextUse は、コンテキストの量か物差しが読めない（会話の記録が無い・圧縮の境目のあと・表に無いモデルなど）ときの値
var NoContextUse = ContextUse{}

const (
	// contextChunk は、会話の記録を後ろから読む 1 度の大きさ
	contextChunk = 256 << 10
	// contextScan は、会話の記録を後ろから読む合計の上限（ここまでに今の量が見つからなければ読めない）
	contextScan = 16 << 20
)

// ReadContextUse は、会話の記録 transcript と、プロジェクトのフォルダ project（設定を重ねる所）、設定のフォルダ configDir、環境変数を引く getenv から、
// 今のコンテキストの量と物差しを読む。どちらかが分からなければ NoContextUse
func ReadContextUse(transcript, project, configDir string, getenv func(string) string) ContextUse {
	last, ok := lastTurnUsage(transcript)
	if !ok {
		return NoContextUse
	}
	limit, ok := ModelLimit(last.model)
	if !ok {
		return NoContextUse
	}
	scale := limit
	if window, ok := AutoCompactWindow(last.model, project, configDir, getenv); ok {
		scale = window
	}
	return ContextUse{Used: last.used, AIScale: scale}
}

// ConfigDir は、Claude Code の設定のフォルダ（CLAUDE_CONFIG_DIR、無ければ ~/.claude。分からなければ空）
func ConfigDir() string {
	if dir := os.Getenv("CLAUDE_CONFIG_DIR"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude")
}

// turnUsage は、会話の記録の最後の AI の返答の、モデルと今のコンテキストの量
type turnUsage struct {
	model string
	used  int64
}

// transcriptLine は、会話の記録の 1 行のうち読む所
type transcriptLine struct {
	Type        string `json:"type"`
	Subtype     string `json:"subtype"`
	IsSidechain bool   `json:"isSidechain"`
	Message     struct {
		Model string     `json:"model"`
		Usage tokenUsage `json:"usage"`
	} `json:"message"`
}

// tokenUsage は、返答の usage のうち読む所（iterations は 1 回の返答の中の呼び出しごと）
type tokenUsage struct {
	tokenCounts
	Iterations []struct {
		Type string `json:"type"`
		tokenCounts
	} `json:"iterations"`
}

type tokenCounts struct {
	Input         int64 `json:"input_tokens"`
	CacheCreation int64 `json:"cache_creation_input_tokens"`
	CacheRead     int64 `json:"cache_read_input_tokens"`
}

func (c tokenCounts) sum() int64 { return c.Input + c.CacheCreation + c.CacheRead }

// syntheticModel は、Claude Code が API を呼ばずに会話の記録に書く返答（断りの文など）のモデルの名前。usage を持たないので飛ばす
const syntheticModel = "<synthetic>"

// lastTurnUsage は、会話の記録 path を後ろから読み、最後の AI の返答のモデルと今のコンテキストの量を返す。
// 読むのは、sidechain（サブエージェント）でない type assistant の行（モデルが <synthetic> の物は飛ばす）。その行より後に圧縮の境目があれば読めない。
// 書きかけの最後の行（改行で終わっていない物）は読まない
func lastTurnUsage(path string) (turnUsage, bool) {
	if path == "" {
		return turnUsage{}, false
	}
	f, err := os.Open(path)
	if err != nil {
		return turnUsage{}, false
	}
	defer f.Close()
	end, err := f.Seek(0, io.SeekEnd)
	if err != nil {
		return turnUsage{}, false
	}
	var head []byte // 1 つ後ろの塊の、まだ行の頭が見えていない分
	first := true
	for read := int64(0); end > 0 && read < contextScan; {
		size := min(int64(contextChunk), end)
		buf := make([]byte, size)
		if _, err := f.ReadAt(buf, end-size); err != nil && err != io.EOF {
			return turnUsage{}, false
		}
		end -= size
		read += size
		text := append(buf, head...)
		if first {
			// 書きかけの最後の行（最後の改行より後）を落とす。改行がまだ見えなければ、もう 1 つ前の塊と合わせて探す
			cut := bytes.LastIndexByte(text, '\n')
			if cut < 0 {
				head = text
				continue
			}
			first = false
			text = text[:cut+1]
		}
		lines := bytes.Split(text, []byte("\n"))
		if end > 0 {
			head = append([]byte(nil), lines[0]...)
			lines = lines[1:]
		} else {
			head = nil
		}
		for i := len(lines) - 1; i >= 0; i-- {
			if usage, verdict := judgeLine(lines[i]); verdict != lineSkip {
				return usage, verdict == lineUsage
			}
		}
	}
	return turnUsage{}, false
}

// lineVerdict は、会話の記録の 1 行を後ろから読んだときの扱い
type lineVerdict int

const (
	lineSkip       lineVerdict = iota // 読み飛ばす
	lineUsage                         // 最後の AI の返答（量が読めた）
	lineUnreadable                    // ここで止める（圧縮の境目、または量の読めない返答）
)

// judgeLine は、会話の記録の 1 行 line を後ろから読んだときの扱い。文字の照らしは JSON を読むかの篩だけにし（ツールの結果の中にも同じ文字が出る）、
// 決めるのは上の段の type・subtype・isSidechain
func judgeLine(line []byte) (turnUsage, lineVerdict) {
	if !bytes.Contains(line, []byte(`"assistant"`)) && !bytes.Contains(line, []byte(compactBoundary)) {
		return turnUsage{}, lineSkip
	}
	var l transcriptLine
	if json.Unmarshal(line, &l) != nil || l.IsSidechain {
		return turnUsage{}, lineSkip
	}
	if isCompactBoundary(l) {
		return turnUsage{}, lineUnreadable
	}
	if l.Type != "assistant" || l.Message.Model == "" || l.Message.Model == syntheticModel {
		return turnUsage{}, lineSkip
	}
	used, ok := contextTokens(l.Message.Usage)
	if !ok {
		return turnUsage{}, lineUnreadable
	}
	return turnUsage{model: l.Message.Model, used: used}, lineUsage
}

// compactBoundary は、Claude Code が会話を縮めたところに書く行（type system）の subtype
const compactBoundary = "compact_boundary"

// isCompactBoundary は、会話の記録の行が、会話を縮めた境目か（type system・subtype compact_boundary。compactMetadata に縮める前の量などを持つ。
// 境目のあとの最初の返答までは、今の量が記録に無い）
func isCompactBoundary(l transcriptLine) bool {
	return l.Type == "system" && l.Subtype == compactBoundary
}

// contextTokens は、返答の usage から、その返答を作った時点のコンテキストの量を読む。
// iterations があれば、そのうち最後の type message の input + cache_creation + cache_read（advisor などの呼び出しは type が違い、上の段の合計はそれも足すので使わない）。
// iterations が無ければ上の段の同じ 3 つ。iterations に type message が無ければ読めない
func contextTokens(u tokenUsage) (int64, bool) {
	if len(u.Iterations) == 0 {
		return u.sum(), true
	}
	for i := len(u.Iterations) - 1; i >= 0; i-- {
		if u.Iterations[i].Type == "message" {
			return u.Iterations[i].sum(), true
		}
	}
	return 0, false
}

const (
	window200k = 200_000
	window1m   = 1_000_000
)

var (
	// modelShape は claude-<種類>-<大>[-<小>][-<日付>] のモデルの名前（例: claude-opus-5-5・claude-sonnet-4-5-20250929・claude-opus-4-20250514）
	modelShape = regexp.MustCompile(`^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$`)
	// oldModelShape は claude-<大>[-<小>]-<種類> の古い形のモデルの名前（例: claude-3-7-sonnet-20250219）
	oldModelShape = regexp.MustCompile(`^claude-\d+(?:-\d)?-(opus|sonnet|haiku)(?:-\d{8})?$`)
)

// oneMillionSuffix は、モデルの名前に付けて 1M のコンテキストで使う印
const oneMillionSuffix = "[1m]"

// ModelLimit は、モデル model のコンテキストの上限（トークン）。Claude Code の説明（code.claude.com の model-config）による:
// Fable・Sonnet 5 以降・Haiku 5.5 以降・Opus 4.7 以降は 1M、Opus 4.6・Sonnet 4.6 とそれより前は 200k（名前に [1m] が付けば 1M）。表に無いモデルは分からない
func ModelLimit(model string) (int64, bool) {
	name, oneMillion := strings.CutSuffix(strings.ToLower(model), oneMillionSuffix)
	if oldModelShape.MatchString(name) {
		return pick(oneMillion, window200k), true
	}
	m := modelShape.FindStringSubmatch(name)
	if m == nil {
		return 0, false
	}
	major, _ := strconv.Atoi(m[2])
	minor := 0
	if m[3] != "" {
		minor, _ = strconv.Atoi(m[3])
	}
	at := func(maj, min int) bool { return major > maj || (major == maj && minor >= min) }
	switch m[1] {
	case "fable":
		return window1m, true
	case "sonnet":
		if at(5, 0) {
			return window1m, true
		}
	case "haiku":
		if at(5, 5) {
			return window1m, true
		}
	case "opus":
		if at(4, 7) {
			return window1m, true
		}
	}
	return pick(oneMillion, window200k), true
}

func pick(oneMillion bool, otherwise int64) int64 {
	if oneMillion {
		return window1m
	}
	return otherwise
}

// claudeSettings は、Claude Code の設定のファイル（settings.json）のうち、自動で縮める所の読み方に要る項目
type claudeSettings struct {
	AutoCompactWindow  *int64                   `json:"autoCompactWindow"`
	AutoCompactEnabled *bool                    `json:"autoCompactEnabled"`
	ModelSettings      map[string]modelSettings `json:"modelSettings"`
	Env                map[string]string        `json:"env"`
}

type modelSettings struct {
	AutoCompactWindow *int64 `json:"autoCompactWindow"`
}

// compactSwitches は、自動の縮めを切る環境変数（DISABLE_COMPACT は手の縮めも切る）
var compactSwitches = []string{"DISABLE_AUTO_COMPACT", "DISABLE_COMPACT"}

// AutoCompactWindow は、モデル model で Claude Code が会話を自動で縮める所（トークン。設定 autoCompactWindow）。
// 設定は、設定のフォルダ configDir の settings.json、プロジェクト project の .claude/settings.json と .claude/settings.local.json の順に重ね、後ろが勝つ。
// modelSettings のそのモデルの名前の項目に autoCompactWindow があれば、上の段より勝つ。
// 自動の縮めが切られている（設定 autoCompactEnabled が false、または環境変数 DISABLE_AUTO_COMPACT・DISABLE_COMPACT。設定の env も見る）か、書かれていなければ無い
func AutoCompactWindow(model, project, configDir string, getenv func(string) string) (int64, bool) {
	var files []string
	if configDir != "" {
		files = append(files, filepath.Join(configDir, "settings.json"))
	}
	if project != "" {
		files = append(files, filepath.Join(project, ".claude", "settings.json"), filepath.Join(project, ".claude", "settings.local.json"))
	}
	var window, modelWindow *int64
	enabled := true
	env := map[string]string{}
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var s claudeSettings
		if json.Unmarshal(data, &s) != nil {
			continue
		}
		if s.AutoCompactWindow != nil {
			window = s.AutoCompactWindow
		}
		if s.AutoCompactEnabled != nil {
			enabled = *s.AutoCompactEnabled
		}
		if m, ok := s.ModelSettings[model]; ok && m.AutoCompactWindow != nil {
			modelWindow = m.AutoCompactWindow
		}
		for k, v := range s.Env {
			env[k] = v
		}
	}
	for _, name := range compactSwitches {
		if switchedOn(getenv(name)) || switchedOn(env[name]) {
			enabled = false
		}
	}
	if !enabled {
		return 0, false
	}
	if modelWindow != nil {
		window = modelWindow
	}
	if window == nil || *window <= 0 {
		return 0, false
	}
	return *window, true
}

// switchedOn は、環境変数の値が入れる側か（空・0・false のほか）
func switchedOn(v string) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	return v != "" && v != "0" && v != "false"
}
