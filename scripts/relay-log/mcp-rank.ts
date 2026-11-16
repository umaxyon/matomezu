// matomezu の MCP の結果を大きさで並べる。結果は以後のリクエストで毎回送り直されるので、呼び出し 1 回につき 1 回だけ数える。
// 呼び出しと結果は、記録するときに部品が並びの項目から取り出した事実（facts.ts の mcp-call と result）。字数は部品の classify と同じく、
// 結果を JSON にした長さ
import type { ClientName } from "./types"

export type McpCall = { session: string; at: string; tool: string; key: string; input: unknown; chars: number }
export type McpToolRank = { key: string; calls: number; chars: number; max: number }
export type McpRank = { byTool: McpToolRank[]; top: McpCall[] }

// 集計の単位: ツールの名前。perform だけは中で何をしたかで大きさが違うので、action ごとに分ける。
// Codex の exec の入力は JavaScript の文（JSON でない）なので action を読まず、perform のまま数える
export function rankKey(tool: string, input: unknown): string {
  const action = (input as { action?: unknown } | null)?.action
  return tool === "perform" && typeof action === "string" ? `perform ${action}` : tool
}

// 呼び出しの事実と、その結果の事実の組（store の mcpRows）。call と result は事実の data の JSON
export type McpFactRow = {
  callId: string
  call: string
  result: string
  client: ClientName
  at: string
  session: string
}

// 結果が初めて現れた所で、呼び出し 1 回を 1 回だけ数える（rows は結果が現れた順）
export function mcpCalls(rows: McpFactRow[]): McpCall[] {
  const done = new Set<string>()
  const calls: McpCall[] = []
  for (const row of rows) {
    const id = `${row.client}:${row.callId}`
    if (done.has(id)) continue
    done.add(id)
    const { tool, input } = JSON.parse(row.call) as { tool: string; input: unknown }
    const { chars } = JSON.parse(row.result) as { chars: number }
    calls.push({ session: row.session, at: row.at, tool, key: rankKey(tool, input), input, chars })
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
