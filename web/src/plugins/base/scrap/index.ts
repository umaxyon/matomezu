// スクラップの、base の側: スクラップを置く枠の印（アイテムの定義の拡張ポイント scrapFrame）、切り抜くダイアログとそれを開くコマンド。
// 切り抜くのは、切り抜きたいページで（ページタブと紙の右クリック）。切り抜いたスクラップはスクラップトレイに入り、置くのはトレイから（ui.tsx）
import { bookType, type CoreCatalog, type ItemId } from "../../../core/core-catalog"
import type { EditList } from "../../../core/def/book-type"
import type { ShapeData } from "../../../core/def/item"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { placeableIn } from "../toolbox/toolbox"
import { SCRAP_CUT, type Scrap } from "./scrap"

// スクラップを置く枠の印（定義オブジェクトの拡張ポイントに書き足す）。true を書いた形は、スクラップトレイから置ける。
// 書けるのは、項目の形がスクラップと同じ形（ScrapSchema）の形だけ（トレイは、スクラップの値だけを項目にして置くため）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    scrapFrame?: unknown extends D["props"]
      ? true
      : D["props"] extends Scrap
        ? Scrap extends D["props"]
          ? true
          : never
        : never
  }
}

// ブック book の、直している並び edits に置ける、スクラップを置く枠のアイテム（いくつもあれば、置ける物の並びの先頭。無ければ null）
export function scrapFrameIn(catalog: CoreCatalog, book: Book, edits: EditList): ItemId | null {
  const found = placeableIn(bookType(catalog, book.type), edits).find(
    id => (catalog.items.get(id) as { scrapFrame?: true } | undefined)?.scrapFrame === true,
  )
  return (found as ItemId | undefined) ?? null
}

// 切り抜くダイアログ（切り抜くページ page。ページは変えない）
export const SCRAP_CUT_DIALOG = kit.defineDialogWith<{ page: string }>()({ id: "scrap-cut" })

// スクラップを切り抜く: ページタブの右クリックなら、そのページ（{ page }）、紙の右クリックなら開いているページで、切り抜くダイアログを開く
export const SCRAP_CUT_COMMAND = kit.defineCommand({
  id: "scrap-cut",
  title: "Cut out a scrap",
  performs: [SCRAP_CUT.id],
  // 受けるのは、ページタブの右クリックのページか、紙の右クリックの所（使わない）
  run: (ctx, a, target: { page?: string; pointer?: unknown }) => {
    const page = target.page ?? ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, SCRAP_CUT_DIALOG.id, { page })
  },
  when: ctx => ctx.book !== null && ctx.stage.opened?.page != null,
})
