// Package sessionend は codex-session-end: Codex の会話 1 つのセッションが終わったことを、matomezu がどのプロセスの終わりで知るかの見立て。
// Codex の文書には無い、実測だけを根拠にした事情をここに閉じ込める。
//
// 根拠にした Codex の振る舞い:
//   - 会話はすべてマシンで 1 つの app-server の中にあるが、MCP のプロセスは会話ごとに別に立つ（親は app-server。--no-daemon なら codex の本体）
//   - /quit・端末を閉じる・/new・本体を kill -9 のどれでも、60〜70 秒後に、app-server が会話を外す（thread/closed）のと同じ時に、その会話の MCP に SIGTERM が届いて終わる
//   - 開いたままの会話の MCP は、何時間でも生きている
//   - resume で戻ると、会話は続くが MCP は入れ替わる。AI が同じ link で参加を頼み直せば、同じ参加者に戻る
//   - app-server が落ちると、MCP は 1 秒以内に終わる
//   - SessionEnd のフックは resume でも呼ばれるので、会話の終わりの印にはならない
package sessionend

// Process は、終わりをセッションの終わりと見るプロセス
type Process string

const (
	Unknown    Process = "unknown"     // どのプロセスの終わりでも分からない（名乗らない）
	MCPProcess Process = "mcp-process" // その会話の MCP のプロセス（入口を通ったなら入口）
)

// Watch は、Codex の会話 1 つのセッションの終わりを、どのプロセスの終わりで知るか
func Watch() Process {
	return MCPProcess
}
