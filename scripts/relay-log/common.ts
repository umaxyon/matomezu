// AI ごとの部品が使う手伝いと、部品の出した物を読む共通の処理
import { createHash } from "node:crypto"
import type { Client, Group, Part, ResultSize, ToolUse, Usage } from "./types"

export const chars = (value: unknown) => JSON.stringify(value ?? "").length
export const hash = (...values: unknown[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 10)

// 利用者や開発者が直せない（AI が毎回入れる）物と、会話そのもの。トグルで隠す
export const HIDDEN_BY_DEFAULT: Group[] = ["固定", "会話"]

export function totals(parts: Part[]): { group: Group; chars: number }[] {
  const by = new Map<Group, number>()
  for (const p of parts) by.set(p.group, (by.get(p.group) ?? 0) + p.chars)
  return [...by].map(([group, chars]) => ({ group, chars })).sort((a, b) => b.chars - a.chars)
}

// 前置きのハッシュの並びが最初に食い違った位置。前が無いか、伸びただけなら none
export function firstDiff(prev: string[] | undefined, cur: string[]): number | "none" {
  if (!prev) return "none"
  const n = Math.min(prev.length, cur.length)
  for (let i = 0; i < n; i++) if (prev[i] !== cur[i]) return i
  return cur.length < prev.length ? cur.length : "none"
}

// 並びの項目の道具の結果を、呼び出した道具の名前を付けて並べる。呼び出しが見つからない結果の名前は ?
export function resultsOf(client: Client<unknown>, items: unknown[]): ResultSize[] {
  const uses = new Map<string, ToolUse>()
  for (const item of items) for (const u of client.toolUses(item)) uses.set(u.id, u)
  return items.flatMap(item =>
    client.toolResults(item).map(r => ({ id: r.id, tool: uses.get(r.id)?.name ?? "?", chars: r.chars })),
  )
}

export function addUsage(into: Usage, value: unknown, prefix = "") {
  if (!value || typeof value !== "object") return
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number") into[prefix + k] = v
    else if (v && typeof v === "object" && !Array.isArray(v)) addUsage(into, v, `${prefix + k}.`)
  }
}

// SSE を届いた順に読み、部品が選んだイベントの usage を拾う。チャンクは行の途中で切れてよい
export class UsageReader {
  private rest = ""
  readonly usage: Usage = {}
  constructor(private readonly client: Pick<Client<unknown>, "usageOfEvent">) {}
  feed(chunk: string) {
    const lines = (this.rest + chunk).split("\n")
    this.rest = lines.pop() ?? ""
    for (const line of lines) this.line(line)
  }
  end() {
    if (this.rest) this.line(this.rest)
    this.rest = ""
  }
  private line(line: string) {
    if (!line.startsWith("data:")) return
    try {
      addUsage(this.usage, this.client.usageOfEvent(JSON.parse(line.slice(5))))
    } catch {}
  }
}

// ストリームでない返答の usage（Messages API も Responses API も本文の頭の usage）
export function usageFromJson(text: string): Usage {
  const usage: Usage = {}
  try {
    addUsage(usage, JSON.parse(text).usage)
  } catch {}
  return usage
}

// SSE の data の行を、JSON として読めた物だけ届いた順に
export function sseEvents(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue
    try {
      const event = JSON.parse(line.slice(5))
      if (event && typeof event === "object") out.push(event)
    } catch {}
  }
  return out
}
