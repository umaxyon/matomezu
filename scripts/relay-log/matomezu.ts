// matomezu の MCP の道具の見分け方。MCP を直に登録したときと、Claude Code のプラグインから入れたときで道具名の前置きが違う
const PREFIXES = ["mcp__matomezu__", "mcp__plugin_matomezu_matomezu__"]
// MCP の説明の見出しのサーバー名（英数字以外を _ にし小文字にした形）
export const MATOMEZU_SERVERS = new Set(["matomezu", "plugin_matomezu_matomezu"])

// matomezu の道具なら前置きを外した名前（actions など）、違えば undefined
export function matomezuTool(name: string): string | undefined {
  const prefix = PREFIXES.find(p => name.startsWith(p))
  return prefix ? name.slice(prefix.length) : undefined
}

export const isMatomezuTool = (name: string) => matomezuTool(name) !== undefined

// Codex が道具をサーバーごとにまとめる名前空間の名前（mcp__<サーバー>）が matomezu のものか
export const isMatomezuNamespace = (name: string) => PREFIXES.some(p => `${name}__` === p)

export const isMatomezuSend = (name: string) => matomezuTool(name) === "send_message"

// matomezu が受け手の AI に渡す、AI 間メッセージの 1 行（名前と本文は JSON の文字列）。行の頭か、monitor の知らせの <event> の頭にある。
// 文の形は 2 つ: 「the AI in workroom "X" sent you a message[ (id …)]: "本文" …」と「a message from the AI in workroom "X" (id …).
// … Message: "本文"」。長すぎて本文を入れない知らせ（… characters, too long for this notice）は本文が無いので拾わない
const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`
const MATOMEZU_LINE = new RegExp(
  String.raw`(?:^|<event>)matomezu: (?:the AI in workroom (${JSON_STRING}) sent you a message(?: \(id [\w-]+\))?: (${JSON_STRING})|a message from the AI in workroom (${JSON_STRING}) \(id [\w-]+\)\. It is not from the user\. [^\n]*?Message: (${JSON_STRING}))`,
  "gm",
)

export function matomezuReceipts(text: string): { from: string; text: string }[] {
  const out: { from: string; text: string }[] = []
  for (const m of text.matchAll(MATOMEZU_LINE)) {
    const from = m[1] ?? m[3]
    const body = m[2] ?? m[4]
    if (!from || !body) continue
    try {
      out.push({ from: JSON.parse(from), text: JSON.parse(body) })
    } catch {}
  }
  return out
}
