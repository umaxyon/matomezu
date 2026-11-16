// matomezu の MCP の結果を大きさで並べる。結果は以後のリクエストで毎回送り直されるので、呼び出し 1 回につき 1 回だけ数える。
// 呼び出しと結果は、その行の AI の部品が並びの項目から取り出す。字数は部品の classify と同じく、結果を JSON にした長さ
import { clientOf } from "./clients"
import { matomezuTool } from "./matomezu"
import type { StoredItem } from "./store"

export type McpCall = { session: string; at: string; tool: string; key: string; input: unknown; chars: number }
export type McpToolRank = { key: string; calls: number; chars: number; max: number }
export type McpRank = { byTool: McpToolRank[]; top: McpCall[] }

// 集計の単位: ツールの名前。perform だけは中で何をしたかで大きさが違うので、action ごとに分ける。
// Codex の exec の入力は JavaScript の文（JSON でない）なので action を読まず、perform のまま数える
export function rankKey(tool: string, input: unknown): string {
  const action = (input as { action?: unknown } | null)?.action
  return tool === "perform" && typeof action === "string" ? `perform ${action}` : tool
}

export function matomezuCalls(items: StoredItem[]): McpCall[] {
  const uses = new Map<string, { name: string; input: unknown }>()
  const done = new Set<string>()
  const calls: McpCall[] = []
  for (const { session, client, at, item } of items) {
    const part = clientOf(client)
    for (const u of part.toolUses(item)) {
      const tool = matomezuTool(u.name)
      if (tool) uses.set(`${client}:${u.id}`, { name: tool, input: u.input })
    }
    for (const r of part.toolResults(item)) {
      const id = `${client}:${r.id}`
      const use = uses.get(id)
      if (!use || done.has(id)) continue
      done.add(id)
      calls.push({ session, at, tool: use.name, key: rankKey(use.name, use.input), input: use.input, chars: r.chars })
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
