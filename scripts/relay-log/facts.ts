// 記録するときに、並びの 1 項目から取り出して表に持つ事実。取り出すのはそのリクエストで分かる事だけで、結ぶのは読むとき（timeline.ts・mcp-rank.ts）。
// 取り出し方（部品の factsOf・toolUses・toolResults と、ここの行の形）を変えたら FACTS_VERSION を上げる。記録を開くときに、版の違う事実を
// 骨組みから作り直す
import { clientOf } from "./clients"
import { matomezuTool } from "./matomezu"
import type { ClientName } from "./types"

export const FACTS_VERSION = 1

// kind ごとの key と data:
//   spawn       Agent の呼び出し。key は呼び出しの id、data は { agentType, description }
//   started     呼び出しの結果から分かった子。key は子の id、data は { callId }
//   return      子の戻り。key は子の id、data は { how }
//   send        送信。key は呼び出しの id、data は { via, to, text }
//   receipt     受信。key は送った側のセッションの名前、data は { via, text }
//   mcp-call    matomezu の MCP 公開ツールの呼び出し。key は呼び出しの id、data は { tool, input }（tool は前置きを外した名前）
//   result      AI のツールの結果（どのツールの物でも）。key は呼び出しの id、data は { chars }
export type FactRow = { kind: string; key: string; data: unknown }

export function factRows(client: ClientName, item: unknown): FactRow[] {
  const part = clientOf(client)
  const f = part.factsOf(item)
  const rows: FactRow[] = [
    ...f.spawns.map(s => ({
      kind: "spawn",
      key: s.callId,
      data: { agentType: s.agentType, description: s.description },
    })),
    ...f.started.map(s => ({ kind: "started", key: s.agentId, data: { callId: s.callId } })),
    ...f.returns.map(r => ({ kind: "return", key: r.agentId, data: { how: r.how } })),
    ...f.sends.map(s => ({ kind: "send", key: s.callId, data: { via: s.via, to: s.to, text: s.text } })),
    ...f.receipts.map(r => ({ kind: "receipt", key: r.from, data: { via: r.via, text: r.text } })),
  ]
  for (const u of part.toolUses(item)) {
    const tool = matomezuTool(u.name)
    if (tool) rows.push({ kind: "mcp-call", key: u.id, data: { tool, input: u.input } })
  }
  for (const r of part.toolResults(item)) rows.push({ kind: "result", key: r.id, data: { chars: r.chars } })
  return rows
}
