// matomezu の Claude Code プラグインの mod: プラグインの monitor が起動されない会話（Claude Desktop の Code タブ）で、起こす知らせを渡す。
// matomezu claude-code watch --via mod を会話の間だけ立て、出た 1 行（知らせ 1 つを JSON の文字列にした物）ごとに、読み戻した知らせを $.prompt.submit してターンを始める。
// asUser で送り主を名乗る包みの文を付けない。利用者の言葉でないことは、そのターンの UserPromptSubmit のフックが添える（matomezu claude-code hook prompt）。
// フックは常駐が貸した文と照らすので、submit からフックが着くまでに常駐が起動し直したときと、常駐に届かないときは、包みも添え書きも無い入力になる
// どの会話を起こすか・知らせの文は matomezu が決める。ここは行を読み戻して渡すだけ
// ターンの終わりには matomezu claude-code work-shift で今の作業が替わったかを訊き、替わっていれば利用者に問いを出す。
// 選んだとおりに会話を空にし（/clear。ターンが待っている hook の中からは打てないので、turn.complete から打つ）、ワーカーブックを読ませる文を打つ。
// 選べる事の外に書いた答えは、問いを添える文を前に付けて AI に打つ。
// 問いと選べる事と打つ文は matomezu が決める。ここは問いを出して選んだ事を行うだけ
import type { Hook, Register } from "claude-code"

const WATCH = ["matomezu", "claude-code", "watch", "--via", "mod"]
const WORK_SHIFT = ["matomezu", "claude-code", "work-shift", "--session"]

// matomezu claude-code work-shift が出す問い
interface WorkShiftAsk {
  question: string
  choices: { label: string; clear: boolean; read: boolean }[]
  read: string
  answered: string
}

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
  on("turn.complete", async ($, e, next) => {
    const done = await next(e)
    // サブエージェントのターンは見ない
    if (e.agentId === undefined) void offerWorkShift($)
    return done
  })
}

// offerWorkShift は、今の作業が替わっていれば利用者に問いを出し、選んだとおりに会話を空にし、ワーカーブックを読ませる文を打つ。
// 選べる事の外に書いた答えは、問いを添える文を前に付けて AI に打つ。
// 聞く人がいない（-p など）・閉じられた・常駐に届かないときは何もしない
async function offerWorkShift($: Parameters<Hook<"turn.complete">>[0]) {
  try {
    const session = await $.session.id()
    const ran = await $.process.run([...WORK_SHIFT, session], { env: await $.process.hookEnv() })
    if (ran.exitCode !== 0 || ran.stdout.trim() === "") return
    const ask = JSON.parse(ran.stdout) as WorkShiftAsk
    const answer = await $.ui.ask(
      ask.question,
      ask.choices.map(c => c.label),
    )
    const chosen = ask.choices.find(c => c.label === answer)
    if (!chosen) {
      const written = answer?.trim()
      if (written) await $.prompt.submit({ text: `${ask.answered}\n\n${written}` })
      return
    }
    if (chosen.clear) await $.command.run({ command: "clear" })
    if (chosen.read && ask.read) await $.prompt.submit({ text: ask.read })
  } catch {
    // 問いを閉じた・聞けない・常駐に届かない
  }
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
