// matomezu の MCP の結果を大きさで並べる。結果は以後のリクエストで毎回送り直されるので、呼び出し 1 回につき 1 回だけ数える。
// 字数は classify と同じく、tool_result の content を JSON にした長さ
import type { Message } from "../relay-log"
import { matomezuTool } from "./matomezu"

export type McpCall = { session: string; at: string; tool: string; key: string; input: unknown; chars: number }
export type McpToolRank = { key: string; calls: number; chars: number; max: number }
export type McpRank = { byTool: McpToolRank[]; top: McpCall[] }

// 集計の単位: ツールの名前。perform だけは中で何をしたかで大きさが違うので、action ごとに分ける
export function rankKey(tool: string, input: unknown): string {
  const action = (input as { action?: unknown } | null)?.action
  return tool === "perform" && typeof action === "string" ? `perform ${action}` : tool
}

export function matomezuCalls(messages: { session: string; at: string; message: Message }[]): McpCall[] {
  const uses = new Map<string, { name: string; input: unknown }>()
  const done = new Set<string>()
  const calls: McpCall[] = []
  for (const { session, at, message } of messages) {
    if (!Array.isArray(message.content)) continue
    for (const b of message.content) {
      const tool = b.type === "tool_use" && typeof b.name === "string" ? matomezuTool(b.name) : undefined
      if (tool) uses.set(b.id as string, { name: tool, input: b.input })
      if (b.type !== "tool_result") continue
      const id = b.tool_use_id as string
      const use = uses.get(id)
      if (!use || done.has(id)) continue
      done.add(id)
      calls.push({
        session,
        at,
        tool: use.name,
        key: rankKey(use.name, use.input),
        input: use.input,
        chars: JSON.stringify(b.content ?? "").length,
      })
    }
  }
  return calls
}

export function rank(calls: McpCall[], topN = 20): McpRank {
  const by = new Map<string, McpToolRank>()
  for (const c of calls) {
    const r = by.get(c.key) ?? { key: c.key, calls: 0, chars: 0, max: 0 }
    r.calls++
    r.chars += c.chars
    r.max = Math.max(r.max, c.chars)
    by.set(c.key, r)
  }
  return {
    byTool: [...by.values()].sort((a, b) => b.chars - a.chars),
    top: [...calls].sort((a, b) => b.chars - a.chars).slice(0, topN),
  }
}
