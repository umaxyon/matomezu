package main

// WSL と Windows の相手の常駐を使う（matomezu use）: 同じ機械の Windows と WSL で、片方の保管庫に、もう片方の OS の常駐を使うと覚えさせる。
// 覚えた保管庫の matomezu は、自分では常駐を立てず、常駐を探す所（running・ensure・stopServer）がその常駐の保管庫の server.json を読んでつなぐ。
// 常駐の鍵（flock）は OS をまたいで効かないので、立っているかは ping で決める。
// Windows から WSL のファイルは \\wsl.localhost\<distro>\... で読める（Claude Desktop の Code タブのパッケージの中からも読める）。
// WSL から Windows の常駐（127.0.0.1 で待つ）に届くのは、WSL がミラーモードのときだけ（NAT モードでは WSL の 127.0.0.1 は Windows と別）。
// Windows から WSL の常駐には、NAT モードでも WSL の localhost の転送で届く

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gofrs/flock"

	"github.com/umaxyon/matomezu/internal/home"
)

type useCmd struct {
	WSL     useWSLCmd     `cmd:"" name:"wsl" help:"On Windows: use the matomezu server of WSL instead of starting one on Windows (for AI programs that run on Windows). Stops the server of Windows."`
	Windows useWindowsCmd `cmd:"" help:"On WSL: use the matomezu server of Windows instead of starting one on WSL (for AI programs that run on WSL). WSL must use mirrored networking. Stops the server of WSL."`
	Local   useLocalCmd   `cmd:"" help:"Start and use the matomezu server of this OS again (undoes matomezu use wsl or matomezu use windows)."`
	Here    useHereCmd    `cmd:"" hidden:"" help:"Print this OS's vault, version and WSL distro as JSON (matomezu use wsl and use windows ask the other OS with it)."`
}

type useWSLCmd struct {
	Distro string `arg:"" optional:"" help:"The WSL distro (the default distro when omitted)."`
}

type useWindowsCmd struct{}

type useLocalCmd struct{}

type useHereCmd struct{}

// hereInfo は、matomezu use here の答え（それを動かした OS の matomezu が見た、自分の保管庫と版と distro と、その保管庫も相手の常駐を使うと覚えているか）
type hereInfo struct {
	Vault   string `json:"vault"`
	Version string `json:"version"`
	Distro  string `json:"distro,omitempty"`
	Uses    bool   `json:"uses,omitempty"`
}

func (useHereCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	u, err := h.ReadCounterpart()
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(hereInfo{Vault: h.Dir, Version: installedVersion(), Distro: os.Getenv("WSL_DISTRO_NAME"), Uses: u != nil})
}

func (c *useWSLCmd) Run() error {
	if runtime.GOOS != "windows" {
		return errors.New("matomezu use wsl is for Windows: on WSL, run matomezu use windows to use the server of Windows")
	}
	u := home.Counterpart{OS: home.CounterpartWSL, Distro: c.Distro}
	in, err := askCounterpart(u)
	if err != nil {
		return err
	}
	if in.Distro == "" {
		return errors.New("the matomezu of WSL did not tell its distro")
	}
	u.Distro = in.Distro
	u.Vault = wslVaultFromWindows(in.Distro, in.Vault)
	return useCounterpart(u, in)
}

func (useWindowsCmd) Run() error {
	if !onWSL() {
		return errors.New("matomezu use windows is for WSL: on Windows, run matomezu use wsl to use the server of WSL")
	}
	mode, err := commandOutput("", "wslinfo", "--networking-mode")
	if err != nil {
		return fmt.Errorf("the networking mode of WSL could not be read: %w", err)
	}
	if m := strings.TrimSpace(string(mode)); m != "mirrored" {
		return fmt.Errorf("WSL uses %s networking, so it cannot reach the server of Windows: set networkingMode=mirrored under [wsl2] in %%UserProfile%%\\.wslconfig, run wsl --shutdown, and try again", m)
	}
	u := home.Counterpart{OS: home.CounterpartWindows}
	in, err := askCounterpart(u)
	if err != nil {
		return err
	}
	vault, err := commandOutput("", "wslpath", "-u", in.Vault)
	if err != nil {
		return fmt.Errorf("the vault of Windows (%s) could not be found from WSL: %w", in.Vault, err)
	}
	u.Vault = strings.TrimSpace(string(vault))
	return useCounterpart(u, in)
}

func (useLocalCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	u, err := h.ReadCounterpart()
	if err != nil {
		return err
	}
	if u == nil {
		fmt.Fprintln(os.Stderr, "this vault already uses the server of this OS:", h.Dir)
		return nil
	}
	if err := h.RemoveCounterpart(); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "this vault no longer uses the server of %s; the server of this OS starts when it is needed: %s\n", counterpartName(*u), h.Dir)
	return nil
}

// useCounterpart は、この保管庫に、相手の常駐 u を使うと覚えさせる（相手の OS の matomezu の答え in）。
// 相手の OS の保管庫もこちらの常駐を使うと覚えていれば断る（互いに相手の常駐を立てさせ合い、どちらも立たない）。
// 先にこの OS の常駐を止め、常駐の鍵を持ったまま覚える（覚えたあとでは止める先が相手の常駐になり、覚える間に立った常駐は止める道が無くなる）
func useCounterpart(u home.Counterpart, in hereInfo) error {
	if in.Uses {
		return fmt.Errorf("the vault of %s uses the server of this OS: run matomezu use local there first", counterpartName(u))
	}
	h, err := openHome()
	if err != nil {
		return err
	}
	lock, err := stopAndLock(h)
	if err != nil {
		return err
	}
	defer lock.Unlock()
	if err := h.WriteCounterpart(u); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "this vault uses the server of %s (vault: %s): %s\n", counterpartName(u), u.Vault, h.Dir)
	if note := versionNote(u, in.Version); note != "" {
		fmt.Fprintln(os.Stderr, note)
	}
	return nil
}

// stopAndLock は、この保管庫の常駐を止めて、常駐の鍵を取る（止めたあとに別の常駐が先に鍵を取れば、それも止めて取り直す）
func stopAndLock(h *home.Home) (*flock.Flock, error) {
	for range 3 {
		if s, err := localRunning(h); err != nil {
			return nil, err
		} else if s != nil {
			fmt.Fprintln(os.Stderr, "stopping the server of", h.Dir)
			if err := stopLocal(h, s); err != nil {
				return nil, err
			}
		}
		lock, err := h.Lock()
		if err == nil {
			return lock, nil
		}
		if !errors.Is(err, home.ErrRunning) {
			return nil, err
		}
		// 鍵を取った常駐が server.json を書き答えるまで待つ
		time.Sleep(500 * time.Millisecond)
	}
	return nil, errors.New("the server of this OS keeps starting again: stop the AI programs that use it, and try again")
}

// askCounterpart は、相手の OS の matomezu に、その保管庫と版と distro を聞く（matomezu use here）
func askCounterpart(u home.Counterpart) (hereInfo, error) {
	name, args, dir := counterpartCommand(u, "use", "here")
	out, err := commandOutput(dir, name, args...)
	if err != nil {
		return hereInfo{}, fmt.Errorf("the matomezu of %s did not answer (is it installed there?): %w", counterpartName(u), err)
	}
	var in hereInfo
	// ログインのシェルが先に書く行があっても、最後の行が答え
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &in); err != nil || in.Vault == "" {
		return hereInfo{}, fmt.Errorf("the matomezu of %s answered something else (is it too old for matomezu use?): %s", counterpartName(u), strings.TrimSpace(string(out)))
	}
	return in, nil
}

// counterpartCommand は、相手の OS u で matomezu のサブコマンド sub を動かすコマンドと、動かすフォルダ（空なら今のフォルダ）。
// WSL の matomezu はホームのフォルダの、対話のログインのシェルで探す（npm・Volta・nvm の PATH はシェルの設定にあり、Ubuntu の .bashrc は対話でなければ読まれない。今のフォルダが matomezu のリポジトリだと、開発の保管庫を使ってしまう）。
// Windows の matomezu は cmd.exe で探す（npm の入口は .cmd）。WSL のフォルダのまま cmd.exe を動かすと UNC のフォルダを断るので、C: で動かす
func counterpartCommand(u home.Counterpart, sub ...string) (name string, args []string, dir string) {
	line := "matomezu " + strings.Join(sub, " ")
	if u.OS == home.CounterpartWSL {
		if u.Distro != "" {
			args = append(args, "-d", u.Distro)
		}
		return "wsl.exe", append(args, "--cd", "~", "--", "bash", "-lic", line), ""
	}
	return "cmd.exe", []string{"/c", line}, "/mnt/c"
}

// commandOutput は、コマンドを動かして標準出力を返す（テストで差し替える）
var commandOutput = func(dir, name string, args ...string) ([]byte, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	return cmd.Output()
}

// wslVaultFromWindows は、WSL の distro の中の保管庫 vault（/home/...）を、Windows から見た場所（\\wsl.localhost\<distro>\home\...）にする
func wslVaultFromWindows(distro, vault string) string {
	return `\\wsl.localhost\` + distro + strings.ReplaceAll(vault, "/", `\`)
}

// counterpartName は、相手の常駐 u の、利用者に見せる名前
func counterpartName(u home.Counterpart) string {
	if u.OS == home.CounterpartWSL {
		return "WSL (" + u.Distro + ")"
	}
	return "Windows"
}

// thisOSName は、相手の常駐 u を使うこの OS の、利用者に見せる名前
func thisOSName(u home.Counterpart) string {
	if u.OS == home.CounterpartWSL {
		return "Windows"
	}
	return "WSL"
}

// counterpartRunning は、相手の常駐 u が立っていて答えるなら、そのつなぎ方（その保管庫の server.json。ping で確かめる）
func counterpartRunning(u *home.Counterpart) (*home.Server, error) {
	s, err := (&home.Home{Dir: u.Vault}).ReadServer()
	if err != nil || s == nil {
		return nil, err
	}
	if _, err := call(s, http.MethodGet, "api/ping"); err != nil {
		return nil, nil
	}
	return s, nil
}

// ensureCounterpart は、相手の常駐 u のつなぎ方を返す。立っていなければ、相手の OS の matomezu start で立て、答えるまで待つ。
// 版が違っても止めて立て直さない（相手の OS の matomezu update に任せる）。違えば一度だけ標準エラーに知らせる
func ensureCounterpart(u *home.Counterpart) (*home.Server, error) {
	s, err := counterpartRunning(u)
	if err != nil {
		return nil, err
	}
	if s == nil {
		name, args, dir := counterpartCommand(*u, "start")
		if _, err := commandOutput(dir, name, args...); err != nil {
			return nil, fmt.Errorf("the server of %s could not be started: %w", counterpartName(*u), err)
		}
		deadline := time.Now().Add(startWait)
		for s == nil {
			if time.Now().After(deadline) {
				return nil, fmt.Errorf("the server of %s did not start in %s", counterpartName(*u), startWait)
			}
			time.Sleep(100 * time.Millisecond)
			if s, err = counterpartRunning(u); err != nil {
				return nil, err
			}
		}
	}
	if note := versionNote(*u, s.Version); note != "" {
		versionNoted.Do(func() { fmt.Fprintln(os.Stderr, note) })
	}
	return s, nil
}

// versionNoted は、版の違いを標準エラーに知らせたか（1 つのプロセスで一度だけ）
var versionNoted sync.Once

// versionNote は、相手の常駐 u の版 other が、この OS の matomezu の版と違うときの、古い方の OS で update するようにという知らせ（同じ・開発の版なら空）
func versionNote(u home.Counterpart, other string) string {
	here := installedVersion()
	if other == "" || other == here || other == devVersion || here == devVersion {
		return ""
	}
	older := counterpartName(u)
	if versionLess(here, other) {
		older = thisOSName(u)
	}
	return fmt.Sprintf("The matomezu server this uses runs on %s with version %s, and the matomezu on %s is version %s: run matomezu update on %s.", counterpartName(u), other, thisOSName(u), here, older)
}

// usedNote は、MCP が AI に見せる、相手の常駐の版が違うことの知らせ（使っていない・同じなら空）
func usedNote(h *home.Home, s *home.Server) string {
	u, err := h.ReadCounterpart()
	if err != nil || u == nil {
		return ""
	}
	return versionNote(*u, s.Version)
}
