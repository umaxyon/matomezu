// matomezu の Claude Code プラグインの mod: プラグインの monitor が起動されない会話（Claude Desktop の Code タブ）で、起こす知らせを渡す。
// matomezu claude-code watch --via mod を会話の間だけ立て、出た 1 行（知らせ 1 つを JSON の文字列にした物）ごとに、読み戻した知らせを $.prompt.submit してターンを始める。
// asUser で送り主を名乗る包みの文を付けない。利用者の言葉でないことは、そのターンの UserPromptSubmit のフックが添える（matomezu claude-code hook prompt）。
// フックは常駐が貸した文と照らすので、submit からフックが着くまでに常駐が起動し直したときと、常駐に届かないときは、包みも添え書きも無い入力になる
// どの会話を起こすか・知らせの文は matomezu が決める。ここは行を読み戻して渡すだけ
import type { Register } from "claude-code"

const WATCH = ["matomezu", "claude-code", "watch", "--via", "mod"]

export const register: Register = on => {
  on("session.start", async ($, e, next) => {
    const started = await next(e)
    // 対話の会話はプラグインの monitor が起こす
    if (e.isInteractive) return started
    const env = await $.process.hookEnv()
    void (async () => {
      let rest = ""
      for await (const piece of $.process.spawn({ argv: WATCH, env })) {
        if (!("stream" in piece) || piece.stream !== "stdout") continue
        rest += piece.text
        for (let i = rest.indexOf("\n"); i >= 0; i = rest.indexOf("\n")) {
          const line = rest.slice(0, i).trim()
          rest = rest.slice(i + 1)
          const text = notice(line)
          if (text) void $.prompt.submit({ text, asUser: true })
        }
      }
    })()
    return started
  })
}

// notice は、watch の 1 行を知らせに読み戻す（JSON の文字列でなければ、読めない行として捨てる）
function notice(line: string): string {
  try {
    const text: unknown = JSON.parse(line)
    return typeof text === "string" ? text.trim() : ""
  } catch {
    return ""
  }
}
