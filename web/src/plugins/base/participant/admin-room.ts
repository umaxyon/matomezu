// 管理者の印の読み: ワークルーム（id）が、このホストの管理者のワークルームか。同じホストの管理者の AI 間メッセージの頭に、利用者の頼みの印を付けるかに使う（常駐が送るときに読む）
import type { CoreCatalog } from "../../../core/core-catalog"
import { type RecordSource, readerOf } from "../../../core/record-source"
import { ADMIN_MARK } from "."

// workroom が、利用者が王冠で選んだ管理者のワークルームなら true（印は全体に 1 件。自動で付いた管理者（by が user でない）と、none は含めない）
export function isAdminWorkroomIn(catalog: CoreCatalog, source: RecordSource, workroom: string): boolean {
  return readerOf(catalog, source, [ADMIN_MARK.id])
    .find(ADMIN_MARK.id, [])
    .some(m => {
      const read = ADMIN_MARK.record.safeParse(m)
      return read.success && read.data.workroom === workroom && read.data.by === "user"
    })
}
