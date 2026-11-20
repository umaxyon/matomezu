package main

// AI ごとのコマンド（matomezu <AI の名前> ...）: matomezu が配る AI のプラグインが呼ぶ入口。プラグインのコマンドを、シェル（sh・cmd・PowerShell）に依らない
// 1 つの行（matomezu codex hook prompt など）にするために、その AI の事情（clients/<AI の名前>）で、AI の種類を問わないコマンド（mcp・watch・talked など）を組み立てる。
// フックは、何があっても 0 で終える（AI の入力を止めない）

import (
	"bytes"
	"os"
	"path/filepath"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	codexlaunch "github.com/umaxyon/matomezu/clients/codex/launch"
	codexsessionend "github.com/umaxyon/matomezu/clients/codex/sessionend"
	opencodelaunch "github.com/umaxyon/matomezu/clients/opencode/launch"
)

// devAddr は、開発の常駐の待ち受け（scripts/dev.ts）
const devAddr = "127.0.0.1:5300"

// devServerFlags は、開発の常駐を使うとき（リポジトリの根 root）の常駐の立て方: 開発の画面を配る web/dist（あれば）と、開発の常駐の待ち受け
func devServerFlags(root string) serverFlags {
	f := serverFlags{Addr: devAddr}
	if info, err := os.Stat(filepath.Join(root, "web", "dist")); err == nil && info.IsDir() {
		f.Web = filepath.Join(root, "web", "dist")
	}
	return f
}

// selfExecutable は、この matomezu の実行ファイル（渡すコマンドに書く）
func selfExecutable() string {
	if self, err := os.Executable(); err == nil {
		return self
	}
	return "matomezu"
}

// claudeCodeCmd は、Claude Code のプラグインが呼ぶコマンドの組
type claudeCodeCmd struct {
	MCP   claudeMCPCmd   `cmd:"" name:"mcp" help:"Serve the MCP tools for Claude Code (with the development server when the project is the matomezu repository)."`
	Hook  claudeHookCmd  `cmd:"" help:"Claude Code's hooks."`
	Watch claudeWatchCmd `cmd:"" help:"Claude Code's monitor: print one line for each thing that should wake this session."`
}

// claudeDev は、Claude Code が開いているプロジェクトが matomezu のリポジトリなら、開発の常駐を使い（起動し直すことがある）、その根を返す。
// monitor には ProjectDirEnv が渡らないので、無ければ今いるフォルダ（Claude Code はプロジェクトのフォルダで立てる）で見る
func claudeDev() string {
	root := devRoot(claudeProjectDir())
	if root != "" {
		useDev(root)
	}
	return root
}

// claudeProjectDir は、Claude Code が開いているプロジェクトのフォルダ（ProjectDirEnv、無ければ今いるフォルダ）
func claudeProjectDir() string {
	if d := os.Getenv(claudelaunch.ProjectDirEnv); d != "" {
		return d
	}
	d, _ := os.Getwd()
	return d
}

type claudeMCPCmd struct{}

// Run は、Claude Code の MCP を出す
func (claudeMCPCmd) Run() error {
	c := mcpCmd{serverFlags: serverFlags{Addr: DefaultAddr}, SessionEndsWith: sessionEndsWith(claudelaunch.SessionEndsWith)}
	if root := claudeDev(); root != "" {
		c.serverFlags = devServerFlags(root)
	}
	return c.Run()
}

// sessionEndsWith は、mcp --session-ends-with の値: たどった AI のプログラムの名前から、その AI の事情（choose）で決める（たどれなければ、空の名前で聞く）
func sessionEndsWith(choose func(name string) string) string {
	_, name := hostProgram()
	return choose(procName(name))
}

// hookHost は、フックが添える AI のプログラムのプロセス id（その AI の事情 send で添えないなら空）
func hookHost(send bool) string {
	if !send {
		return ""
	}
	return hostProcess()
}

type claudeHookCmd struct {
	Prompt     claudePromptCmd     `cmd:"" help:"UserPromptSubmit: tell matomezu the user talked, and add the notes that wait for AI."`
	Model      claudeModelCmd      `cmd:"" help:"SessionStart and PostModelSwitch: tell matomezu the session's model."`
	Permission claudePermissionCmd `cmd:"" help:"PreToolUse: let the matomezu tools that only read be used without asking."`
}

type claudePromptCmd struct{}

// Run は、ターンの始まりを知らせ、待つアノテーションを添える
func (claudePromptCmd) Run() error {
	claudeDev()
	hookPrompt(hookHost(claudelaunch.HooksSendHost), claudelaunch.HookSetsTitle, claudelaunch.Woken)
	return nil
}

type claudeModelCmd struct{}

// Run は、セッションのモデルを知らせる
func (claudeModelCmd) Run() error {
	claudeDev()
	hookModel(hookHost(claudelaunch.HooksSendHost))
	return nil
}

type claudePermissionCmd struct{}

// Run は、読むだけの matomezu の MCP 公開ツールを、聞かずに使ってよいと答える（常駐を使わない）
func (claudePermissionCmd) Run() error {
	permission(os.Stdout, stdinHook())
	return nil
}

type claudeWatchCmd struct{}

// Run は、このセッションへの起こす知らせを 1 行ずつ出す。宛て先は、たどった AI のプログラムと、Claude Code が立てたときのセッション id
// （Windows では、monitor から AI のプログラムまでたどれないことがある。そのときはセッション id だけで合わせる）
func (claudeWatchCmd) Run() error {
	claudeDev()
	w := watchCmd{Host: hostProcess(), Session: os.Getenv(claudelaunch.SessionEnv), MaxLine: claudelaunch.MaxLine, MaxNotice: claudelaunch.MaxNotice, Gap: claudelaunch.Gap}
	if w.Host == "" && w.Session == "" {
		return nil
	}
	return w.Run()
}

// codexCmd は、Codex のプラグインが呼ぶコマンドの組
type codexCmd struct {
	MCP     codexMCPCmd     `cmd:"" name:"mcp" help:"Serve the MCP tools for Codex, and hand wake notices to its conversations (with the development server when the plugin was installed from the matomezu repository)."`
	Hook    codexHookCmd    `cmd:"" help:"Codex's hooks."`
	Deliver deliverCodexCmd `cmd:"" help:"Hand a wake notice to a Codex conversation through the app-server (daemon) of CODEX_HOME (~/.codex when unset): the text on stdin, the conversation in MATOMEZU_SESSION. Exits 0 when delivered, 3 when the app-server does not have that conversation, 1 when it failed."`
}

// codexDev は、Codex のプラグインを matomezu のリポジトリから入れたなら、開発の常駐を使い（起動し直すことがある）、その根を返す
func codexDev() string {
	root := devRoot(codexlaunch.InstalledFrom(codexlaunch.Home()))
	if root != "" {
		useDev(root)
	}
	return root
}

type codexMCPCmd struct{}

// codexSessionEndsWith は、codex-session-end の見立て watch を、mcp --session-ends-with の値に読み替える（分からなければ名乗らない）
func codexSessionEndsWith(watch codexsessionend.Process) string {
	if watch == codexsessionend.MCPProcess {
		return "mcp"
	}
	return ""
}

// Run は、Codex の MCP を出し、起こす知らせを Codex の会話に渡す watch も中で動かす
func (codexMCPCmd) Run() error {
	c := mcpCmd{serverFlags: serverFlags{Addr: DefaultAddr}, SessionEndsWith: codexSessionEndsWith(codexsessionend.Watch()), MetaModel: codexlaunch.MetaModel, NotClaudeCode: true, Deliver: append([]string{selfExecutable()}, codexlaunch.DeliverArgs...)}
	if root := codexDev(); root != "" {
		c.serverFlags = devServerFlags(root)
	}
	return c.Run()
}

type codexHookCmd struct {
	Prompt codexPromptCmd `cmd:"" help:"UserPromptSubmit: tell matomezu the user talked, and add the notes that wait for AI."`
	Model  codexModelCmd  `cmd:"" help:"SessionStart: tell matomezu the session's model."`
}

type codexPromptCmd struct{}

// Run は、ターンの始まりを知らせ、待つアノテーションを添える
func (codexPromptCmd) Run() error {
	codexDev()
	hookPrompt(hookHost(codexlaunch.HooksSendHost), codexlaunch.HookSetsTitle, nil)
	return nil
}

type codexModelCmd struct{}

// Run は、セッションのモデルを知らせる
func (codexModelCmd) Run() error {
	codexDev()
	hookModel(hookHost(codexlaunch.HooksSendHost))
	return nil
}

// opencodeCmd は、opencode のプラグインが呼ぶコマンドの組
type opencodeCmd struct {
	MCP     opencodeMCPCmd     `cmd:"" name:"mcp" help:"Serve the MCP tools for opencode."`
	Deliver deliverOpencodeCmd `cmd:"" help:"Hand a wake notice to an opencode conversation through the opencode background server (opencode/service.json under XDG_STATE_HOME, ~/.local/state when unset), as an input that is not the user's (synthetic) marked as a wake notice: the text on stdin, the conversation in MATOMEZU_SESSION. Exits 0 when delivered, 3 when the server does not have that conversation, 1 when it failed."`
}

// opencodeMCPCmd は、opencode の MCP。常駐の立て方は opencode のプラグインが渡す（開発の常駐かを、プラグインが見分ける）
type opencodeMCPCmd struct {
	serverFlags
}

// Run は、opencode の MCP を出す
func (c opencodeMCPCmd) Run() error {
	m := mcpCmd{serverFlags: c.serverFlags, MetaSession: opencodelaunch.MetaSession, NotClaudeCode: true}
	return m.Run()
}

// hookPrompt は、話しかけのフック: 待つアノテーションの文を添えて、ターンの始まりを常駐に知らせ、フックの答えを出す（host は AI のプログラムのプロセス id、分からなければ空。
// titled は、答えに会話の題名 sessionTitle を書くか。woken は、フックが --woken を渡せない AI のプログラムが、裏の知らせで始まったターンを入力から見分ける物。渡せるなら nil）
func hookPrompt(host string, titled bool, woken func(prompt string) bool) {
	var notes bytes.Buffer
	writeAnnotations(&notes)
	hook := stdinHook()
	hook.Host = host
	hook.Titled = titled
	hook.Woken = hook.Woken || (woken != nil && woken(hook.Prompt))
	talked(os.Stdout, hook, notes.String(), formatHook, runningAPI("api/ai/talked"))
}

// hookModel は、モデルのフック: セッションのモデルを常駐に知らせる（host は AI のプログラムのプロセス id、分からなければ空）
func hookModel(host string) {
	hook := stdinHook()
	hook.Host = host
	sendModel(hook, runningAPI("api/ai/model"))
}
