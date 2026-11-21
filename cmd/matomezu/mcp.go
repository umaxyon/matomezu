package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/mcp"
	"github.com/umaxyon/matomezu/internal/server"
)

type mcpCmd struct {
	serverFlags
	Resident        bool     `help:"With a deliver command: start it once and keep it running (as watch --resident)."`
	SessionEndsWith string   `enum:"program,mcp," default:"" help:"Say which process lives as long as this session, so that when it is gone the session has ended and matomezu may remove the participant: program is the AI's program (when it runs this one session only), mcp is this MCP's own process (or the entry that started it). Leave it out when neither can be said."`
	MetaSession     []string `name:"meta-session" help:"Where in a tool call's _meta the AI program puts its session id (a JSON Pointer such as /ai.opencode~1sessionID), looked at after /sessionId and /threadId. Repeat for more."`
	MetaModel       string   `name:"meta-model" help:"Where in a tool call's _meta the AI program puts its model (a JSON Pointer such as /x-codex-turn-metadata/model)."`
	Deliver         []string `arg:"" optional:"" passthrough:"" help:"A command (after --) that hands each wake notice to the AI, as watch does with it. The MCP then also watches for the notices of its host program while it runs (for an AI program that has no background monitor)."`
	// Session は、AI のプログラムが立てたときのセッション id（常駐への呼び出しに添える）。claude-code mcp だけが Claude Code の環境変数から入れる
	// （Claude Code の Bash から起こされたほかの AI もその環境変数を受け継ぐので、ほかの MCP が読むと、常駐がその Claude Code の参加者と取り違える）
	Session string `kong:"-"`
	// Place は、join のときに AI が動いている場所の名前を読む（AI を並べて起動する道具の表示名など。clients の部品を、AI のプログラムごとのコマンドが入れる。nil なら添えない）
	Place func() string `kong:"-"`
}

func (c *mcpCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, c.serverFlags)
	if err != nil {
		return err
	}
	// 渡すコマンドがあれば、起こす知らせの watch も並べて動かす（標準出力は MCP が使うので、渡すコマンドが無いときは動かさない）
	host := hostProcess()
	session := c.Session
	if len(deliverCommand(c.Deliver)) > 0 {
		w := &watchCmd{Host: host, Session: session, Resident: c.Resident, Deliver: c.Deliver}
		go func() {
			if err := w.Run(); err != nil {
				fmt.Fprintln(os.Stderr, "matomezu mcp: wake notices are not handed to the AI:", err)
			}
		}()
	}
	return mcp.Serve(os.Stdin, os.Stdout, &httpAPI{s: s, reconnect: func() (*home.Server, error) { return ensure(h, c.serverFlags) }}, version, envName(), gitBranch, c.Place, host, session, sessionPid(c.SessionEndsWith, host), sessionPidSpace(c.SessionEndsWith), mcp.Meta{Session: c.MetaSession, Model: c.MetaModel})
}

// sessionPid は、--session-ends-with の値 endsWith が指す、セッションと同じだけ生きるプロセスの id（空なら名乗らない）。
// program は AI のプログラム（親をたどった host）。mcp はこの MCP のプロセスで、npm の node の入口を通ったなら（入口が親なら）その入口のプロセス
func sessionPid(endsWith, host string) string {
	switch endsWith {
	case "program":
		return host
	case "mcp":
		if entry := os.Getenv(entryPIDEnv); entry != "" && entry == strconv.Itoa(os.Getppid()) {
			return entry
		}
		return strconv.Itoa(os.Getpid())
	}
	return ""
}

// sessionPidSpace は、セッションのプロセスを名乗るとき（endsWith が空でないとき）の、プロセス id が通じる範囲の印
func sessionPidSpace(endsWith string) string {
	if endsWith == "" {
		return ""
	}
	return server.ProcessSpace()
}

// envName は MCP が参加のときに常駐へ渡す環境名（runtime.GOOS。Linux の中で WSL と分かれば wsl- を頭に付ける）
func envName() string {
	if runtime.GOOS == "linux" {
		if os.Getenv("WSL_DISTRO_NAME") != "" {
			return "wsl-linux"
		}
		if v, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil && strings.Contains(strings.ToLower(string(v)), "microsoft") {
			return "wsl-linux"
		}
	}
	return runtime.GOOS
}

// gitBranchWait は、git のブランチを読むのを待つ長さ
const gitBranchWait = time.Second

// gitBranch は、MCP が呼び出しのたびに常駐へ添える、作業フォルダの git のブランチ（git が無い・リポジトリでない・ブランチに居ない・待ちきれないなら空）
func gitBranch() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitBranchWait)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "branch", "--show-current").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
