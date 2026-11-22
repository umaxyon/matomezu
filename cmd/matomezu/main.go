// matomezu の CLI。常駐（serve）を立てる・止める入口。
package main

import (
	"fmt"
	"os"

	"github.com/alecthomas/kong"
)

var version = devVersion

// DefaultPort は、利用者がポートを選んでいない保管庫の常駐が 127.0.0.1 で待つポート。画面 cookie は名前にポートを入れるので、ポートを変えたら matomezu open で渡し直す
const DefaultPort = 7230

type cli struct {
	Serve        serveCmd        `cmd:"" help:"Run the server in the foreground."`
	Start        startCmd        `cmd:"" help:"Start the server in the background unless it is running, and print its URL."`
	Stop         stopCmd         `cmd:"" help:"Stop the background server."`
	Open         openCmd         `cmd:"" help:"Open the screen in your browser and give it the server's screen cookie (for a browser that has none). Nothing is printed."`
	MCP          mcpCmd          `cmd:"" name:"mcp" help:"Serve the MCP tools for an AI on stdin and stdout (starts the server unless it is running)."`
	Annotations  annotationsCmd  `cmd:"" help:"Print the annotations (such as the user's notes and marks) that wait for AI's answer, and AI's changes the user undid before seeing them, for an AI's hook. Prints nothing when there are none or the server is not running."`
	Talked       talkedCmd       `cmd:"" help:"Tell the server the user talked to AI, for an AI's hook that passes the hook's JSON on stdin (the notes AI has read start their expiry; the session is tied to the participant who joined from it, and a participant who just joined is welcomed in the hook's JSON). Prints --context when there is nothing else to say, and does nothing when the server is not running."`
	Watch        watchCmd        `cmd:"" help:"Print one line for each thing the user did on the screen that should wake AI (such as accepting AI's request to join), for an AI's background monitor. Waits for the server and reconnects; prints nothing else."`
	Model        modelCmd        `cmd:"" help:"Tell the server the model of AI's session, for an AI's hook (SessionStart or PostModelSwitch) that passes the hook's JSON on stdin (model or to_model). Does nothing when the JSON has no model or the server is not running."`
	ClaudeCode   claudeCodeCmd   `cmd:"" name:"claude-code" help:"Commands that matomezu's Claude Code plugin runs (its MCP, hooks and monitor)."`
	Codex        codexCmd        `cmd:"" help:"Commands that matomezu's Codex plugin runs (its MCP, hooks, and the command that hands wake notices to a Codex conversation)."`
	Opencode     opencodeCmd     `cmd:"" help:"Commands that matomezu's opencode plugin runs (its MCP, and the command that hands wake notices to an opencode conversation)."`
	PluginPath   pluginPathCmd   `cmd:"" name:"plugin-path" help:"Print the folder of matomezu's plugin for an AI program, to add it from (such as claude plugin marketplace add)."`
	Plugin       pluginCmd       `cmd:"" help:"Manage matomezu plugins for AI clients."`
	PluginRemove pluginRemoveCmd `cmd:"" name:"plugin-remove" help:"Before removing matomezu (npm uninstall -g matomezu): stop the server and remove matomezu's plugin from the AI programs (Claude Code, Codex and opencode). Your books are kept."`
	Update       updateCmd       `cmd:"" help:"Update matomezu with the tool it was installed with (npm, Volta, pnpm or bun), update the plugins of the AI programs to the same version, and start the server again with the new version."`
	Version      versionCmd      `cmd:"" help:"Print the version."`
}

type versionCmd struct{}

func main() {
	ctx := kong.Parse(&cli{}, kong.Name("matomezu"), kong.Description("Diagrams you and your AI read and edit together."))
	if err := ctx.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func (versionCmd) Run() error {
	fmt.Println(version)
	return nil
}
