// ワーカーブック: ワークルームの作業の資料のブック（tickets-history の中の 1 冊）を引く workKey と名前。
// 作業中なら、取り組んでいる物（workroomWork が答えるレコード。チケットなど）の物。空きか、答える種類が無ければ、ワークルーム自身の物

import type { CoreCatalog } from "../../../core/core-catalog"
import type { WorkKey } from "../../../core/folders"
import type { RecordSource } from "../../../core/record-source"
import { workroomWorkIn } from "./activity"
import { WORKROOM } from "./index"

// ワークルーム workroom のワーカーブックの workKey と名前 title（ワークルームのレコードが無ければ、名前はワークルームの id）
export function workerBookOf(
  catalog: CoreCatalog,
  source: RecordSource,
  workroom: string,
): { workKey: WorkKey; title: string } {
  const work = workroomWorkIn(catalog, source, workroom)
  if (work !== "unknown" && work.kind === "working") return { workKey: work.key, title: work.label }
  const room = source.byId(WORKROOM.id, workroom) as { name?: unknown } | undefined
  return {
    workKey: { subject: WORKROOM.id, id: workroom },
    title: typeof room?.name === "string" ? room.name : workroom,
  }
}
