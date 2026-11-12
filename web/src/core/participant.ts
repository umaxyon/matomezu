// 参加者まわりで core が持つ取り決め: ワークルームの名前の長さの上限と、AI が参加を頼むときに行うアクション（役で引く）。
// 参加者とワークルームのデータ（レコード）の形は base が対象の定義で決め、常駐が読む所は対象の定義の役（SubjectDef の role）で引く
import type { CoreCatalog } from "./core-catalog"

export const WORKROOM_NAME_MAX = 20 // ワークルームの名前の長さの上限（字）

// AI が参加を頼むときに行うアクション（アクションの定義が runsWhenAIJoins で名乗る物）の id。役が揃っていなければ null
export function joinActions(catalog: CoreCatalog): { participant: string; notice: string } | null {
  const roles = new Map<string, string>()
  for (const a of catalog.actions.values()) if (a.runsWhenAIJoins) roles.set(a.runsWhenAIJoins, a.id)
  const participant = roles.get("make-participant")
  const notice = roles.get("notify-user")
  return participant && notice ? { participant, notice } : null
}
