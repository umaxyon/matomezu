// 参加者まわりで core が持つ取り決め: AI が参加を頼むとき・参加者のセッションが終わったときに行うアクション（役で引く）。
// 参加者とワークルームのデータ（レコード）の形は base が対象の定義で決め、常駐が読む所は対象の定義の役（SubjectDef の role）で引く
import type { CoreCatalog } from "./core-catalog"

// AI が参加を頼むときに行うアクション（アクションの定義が runsWhenAIJoins で名乗る物）の id。役が揃っていなければ null
export function joinActions(catalog: CoreCatalog): { participant: string; notice: string } | null {
  const roles = new Map<string, string>()
  for (const a of catalog.actions.values()) if (a.runsWhenAIJoins) roles.set(a.runsWhenAIJoins, a.id)
  const participant = roles.get("make-participant")
  const notice = roles.get("notify-user")
  return participant && notice ? { participant, notice } : null
}

// 参加者のセッションが終わったときに常駐が行うアクション（アクションの定義が runsWhenAIEnds で名乗る物）の id。無ければ null
export function endActions(catalog: CoreCatalog): { leave: string } | null {
  for (const a of catalog.actions.values()) if (a.runsWhenAIEnds) return { leave: a.id }
  return null
}
