// 記録した返答（SSE か JSON の本文）から、モデルが返した中身をブロックに組み直す
export type ReplyBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: string }
  | { type: "thinking"; text: string }

type Partial = { type: string; name?: string; text: string }

export function parseReply(raw: string): ReplyBlock[] {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith("{")) return fromJson(trimmed)
  const parts = new Map<number, Partial>()
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue
    let event: {
      type?: string
      index?: number
      content_block?: Record<string, unknown>
      delta?: Record<string, unknown>
    }
    try {
      event = JSON.parse(line.slice(5))
    } catch {
      continue
    }
    if (event.index === undefined) continue
    if (event.type === "content_block_start" && event.content_block) {
      const b = event.content_block
      parts.set(event.index, { type: String(b.type), name: b.name as string | undefined, text: "" })
    } else if (event.type === "content_block_delta" && event.delta) {
      const p = parts.get(event.index)
      if (!p) continue
      const d = event.delta
      p.text += String(d.text ?? d.partial_json ?? d.thinking ?? "")
    }
  }
  return [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => toBlock(p))
}

function toBlock(p: Partial): ReplyBlock {
  if (p.type === "tool_use") return { type: "tool_use", name: p.name ?? "?", input: p.text }
  if (p.type === "thinking") return { type: "thinking", text: p.text }
  return { type: "text", text: p.text }
}

function fromJson(text: string): ReplyBlock[] {
  try {
    const content = JSON.parse(text).content
    if (!Array.isArray(content)) return []
    return content.map((b: Record<string, unknown>) =>
      toBlock({
        type: String(b.type),
        name: b.name as string | undefined,
        text: b.type === "tool_use" ? JSON.stringify(b.input) : String(b.text ?? b.thinking ?? ""),
      }),
    )
  } catch {
    return []
  }
}
