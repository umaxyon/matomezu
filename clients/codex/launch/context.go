package launch

// AI のコンテキストの大きさ: Codex の会話の記録（rollout の jsonl。フックの入力の transcript_path）から、今のコンテキストの量と、AI の側の物差し（model_context_window）を読む。
// 会話の記録の形は Codex が公式に約束した物ではないので、頼る所はこのファイルの名前の付いた関数に閉じ、根拠を書く。

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
)

// ContextUse は、会話 1 つの今のコンテキストの量（Used。トークン）と、AI の側の物差し（AIScale。トークン）
type ContextUse struct {
	Used    int64
	AIScale int64
}

// NoContextUse は、コンテキストの量か物差しが読めない（会話の記録が無い・圧縮のあとまだ量が無いなど）ときの値
var NoContextUse = ContextUse{}

const (
	// contextChunk は、会話の記録を後ろから読む 1 度の大きさ
	contextChunk = 256 << 10
	// contextScan は、会話の記録を後ろから読む合計の上限（ここまでに今の量が見つからなければ読めない）
	contextScan = 16 << 20
)

// ReadContextUse は、会話の記録 rollout を後ろから読み、最後の量の知らせ（tokenCount）から、今のコンテキストの量と物差しを読む。
// その知らせより後に圧縮の印（compacted）があれば読めない。書きかけの最後の行（改行で終わっていない物）は読まない
func ReadContextUse(rollout string) ContextUse {
	if rollout == "" {
		return NoContextUse
	}
	f, err := os.Open(rollout)
	if err != nil {
		return NoContextUse
	}
	defer f.Close()
	end, err := f.Seek(0, io.SeekEnd)
	if err != nil {
		return NoContextUse
	}
	var head []byte // 1 つ後ろの塊の、まだ行の頭が見えていない分
	first := true
	for read := int64(0); end > 0 && read < contextScan; {
		size := min(int64(contextChunk), end)
		buf := make([]byte, size)
		if _, err := f.ReadAt(buf, end-size); err != nil && err != io.EOF {
			return NoContextUse
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
			if use, verdict := judgeLine(lines[i]); verdict != lineSkip {
				return use
			}
		}
	}
	return NoContextUse
}

// rolloutLine は、会話の記録の 1 行のうち読む所
type rolloutLine struct {
	Type    string `json:"type"`
	Payload struct {
		Type string `json:"type"`
		Info *struct {
			LastTokenUsage struct {
				TotalTokens int64 `json:"total_tokens"`
			} `json:"last_token_usage"`
			ModelContextWindow int64 `json:"model_context_window"`
		} `json:"info"`
	} `json:"payload"`
}

// lineVerdict は、会話の記録の 1 行を後ろから読んだときの扱い
type lineVerdict int

const (
	lineSkip lineVerdict = iota // 読み飛ばす
	lineStop                    // ここで止める（量が読めたか、圧縮の印か、量の読めない知らせ）
)

// judgeLine は、会話の記録の 1 行 line を後ろから読んだときの扱い。文字の照らしは JSON を読むかの篩だけにし（ツールの結果の中にも同じ文字が出る）、
// 決めるのは上の段の type と payload.type
func judgeLine(line []byte) (ContextUse, lineVerdict) {
	if !bytes.Contains(line, []byte(tokenCount)) && !bytes.Contains(line, []byte(compacted)) {
		return NoContextUse, lineSkip
	}
	var l rolloutLine
	if json.Unmarshal(line, &l) != nil {
		return NoContextUse, lineSkip
	}
	if l.Type == compacted {
		return NoContextUse, lineStop
	}
	if l.Type != "event_msg" || l.Payload.Type != tokenCount || l.Payload.Info == nil {
		return NoContextUse, lineSkip
	}
	return contextOf(l), lineStop
}

const (
	// tokenCount は、Codex が返答のたびと圧縮のあとに書く、量の知らせ（type event_msg の payload.type）。info の last_token_usage が最後の呼び出しの量、
	// model_context_window がそのモデルの文脈の大きさ（Codex が自動で縮める物差し）。最初の知らせなど、info が null の物もある
	tokenCount = "token_count"
	// compacted は、Codex が会話を縮めたところに書く行の type（payload.replacement_history が縮めたあとの会話。そのあとの最初の返答までは、今の量が記録に無い）
	compacted = "compacted"
)

// contextOf は、量の知らせ l から今のコンテキストの量と物差しを読む（どちらかが正でなければ NoContextUse）。
// 量は last_token_usage の total_tokens（累積の total_token_usage ではない）。Codex の画面も、文脈の量はこれで測る（codex-rs の tui/src/token_usage.rs・tui/src/status/card.rs）。
// 圧縮の直後に Codex が出す知らせは、input_tokens が 0 でも total_tokens に縮めたあとの推定が入る（core/src/session/mod.rs）。
// キャッシュから読んだ分（cached_input_tokens）は、モデルの文脈に入るので引かない（Codex の画面と scripts/relay-log が引くのは、キャッシュに無かった分を見せるため）。
// 棒は量を物差しで割っただけの占有率で、Codex の画面の残りの割合（決まった 12000 を引いて測る）とは合わせない
func contextOf(l rolloutLine) ContextUse {
	used, window := l.Payload.Info.LastTokenUsage.TotalTokens, l.Payload.Info.ModelContextWindow
	if used <= 0 || window <= 0 {
		return NoContextUse
	}
	return ContextUse{Used: used, AIScale: window}
}
