// ホストどうしで core が持つ取り決め: ほかのホストに応じて常駐が利用者として行うアクションの役（アクションの定義が runsBetweenHosts で名乗る）。
// ペアリングしたホストとペアリングの頼みのデータ（レコード）の形はプラグインが対象の定義で決め、常駐が読む所は対象の定義の役（SubjectDef の role）で引く
import type { CoreCatalog } from "./core-catalog"

// 役: ペアリングの頼みを載せる（頼みが届いた）・消す（取り下げ・時間切れ・利用者が断った）・ペアリングしたホストを載せる（相手が受け入れた）・消す（相手が解いた・相手がペアリングしていないと答えた）
export const HOST_ROLES = [
  "add-pairing-request",
  "remove-pairing-request",
  "add-paired-host",
  "remove-paired-host",
] as const
export type HostRole = (typeof HOST_ROLES)[number]

// 役ごとの、名乗るアクションの id（名乗る物の無い役は入らない）
export function hostActions(catalog: CoreCatalog): Partial<Record<HostRole, string>> {
  const out: Partial<Record<HostRole, string>> = {}
  for (const a of catalog.actions.values()) if (a.runsBetweenHosts) out[a.runsBetweenHosts] = a.id
  return out
}
