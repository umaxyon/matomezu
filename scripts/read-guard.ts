// Claude Code の PreToolUse フック（matcher Bash）。大きなコードと json のファイルを、Bash で丸ごと読むのを断る
//   .claude/settings.json の hooks から bun "$CLAUDE_PROJECT_DIR/scripts/read-guard.ts" で呼ばれ、標準入力のフックの入力（JSON）を読む
//   断る物: cat・bat・less に、WHOLE_READ_LIMIT_BYTES を超える GUARDED_EXTENSIONS のファイルを渡し、出力をそのまま受け取るコマンド。
//     && ; || でつないだ各部分を見る。cd の行き先は追う
//     断るときは permissionDecision "deny" と、grep と Read の offset・limit で要る範囲だけ読むようにという理由を返す
//   断らない物: パイプの先がある物、書き込みやヒアドキュメント（> <）を含む物、sed -n の範囲・grep・git diff/show など cat 以外、
//     md や画像など GUARDED_EXTENSIONS に無いファイル
//   どのファイルか決められないとき（変数・グロブ・行き先の分からない cd・無いファイル）と、入力の JSON が読めないときは通す
import { statSync } from "node:fs"
import { extname, isAbsolute, resolve } from "node:path"

export const WHOLE_READ_LIMIT_BYTES = 20 * 1024
export const GUARDED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".go", ".css", ".json"])
const WHOLE_READERS = new Set(["cat", "bat", "less"])

// ファイルの大きさ（バイト）。無いときは undefined
export type SizeOf = (path: string) => number | undefined

export const sizeOnDisk: SizeOf = path => {
  try {
    const s = statSync(path)
    return s.isFile() ? s.size : undefined
  } catch {
    return undefined
  }
}

// 引用符を外して語に分ける。引用符が閉じていなければ undefined
function words(text: string): string[] | undefined {
  const out: string[] = []
  let cur = ""
  let quote: string | undefined
  let has = false
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = undefined
      else cur += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur)
      cur = ""
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (quote) return undefined
  if (has || cur) out.push(cur)
  return out
}

const UNRESOLVED = /[$`*?[\]{}~]/

// 断る理由。断らないときは undefined
export function decide(command: string, cwd: string, sizeOf: SizeOf): string | undefined {
  let dir: string | undefined = cwd
  for (const part of command.split(/&&|\|\||;|\n/)) {
    // ヒアドキュメントから先は本文で、コマンドではない
    if (part.includes("<<")) return undefined
    const stages = part.split("|")
    const w = words(stages[0] ?? "")
    if (!w || w.length === 0) continue
    if (w[0] === "cd") {
      const to = w[1]
      dir = to === undefined || UNRESOLVED.test(to) || dir === undefined ? undefined : resolve(dir, to)
      continue
    }
    if (!WHOLE_READERS.has(w[0] ?? "") || stages.length > 1 || /[<>]/.test(part)) continue
    for (const arg of w.slice(1)) {
      if (arg.startsWith("-") || UNRESOLVED.test(arg)) continue
      if (!GUARDED_EXTENSIONS.has(extname(arg))) continue
      if (!isAbsolute(arg) && dir === undefined) continue
      const size = sizeOf(isAbsolute(arg) ? arg : resolve(dir as string, arg))
      if (size !== undefined && size > WHOLE_READ_LIMIT_BYTES) {
        return `${arg} は ${Math.round(size / 1024)}KB。丸ごと読んだ物は会話に残り、毎回のリクエストで送られ続ける。grep で場所を探し、Read の offset と limit で要る範囲だけ読む`
      }
    }
  }
  return undefined
}

// フックの入力（JSON の文字列）から、標準出力に書く物を作る。何も書かないときは undefined
export function hookOutput(input: string, sizeOf: SizeOf): string | undefined {
  let parsed: { tool_name?: unknown; tool_input?: { command?: unknown }; cwd?: unknown }
  try {
    parsed = JSON.parse(input)
  } catch {
    return undefined
  }
  const command = parsed.tool_input?.command
  if (parsed.tool_name !== "Bash" || typeof command !== "string" || typeof parsed.cwd !== "string") return undefined
  const reason = decide(command, parsed.cwd, sizeOf)
  if (reason === undefined) return undefined
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  })
}

if (import.meta.main) {
  const out = hookOutput(await Bun.stdin.text(), sizeOnDisk)
  if (out !== undefined) process.stdout.write(out)
}
