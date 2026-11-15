// スクラップの、base の側: スクラップフレームの印（アイテムの定義の拡張ポイント scrapFrame）、切り抜くダイアログとそれを開くコマンド。
// 切り抜くのは、切り抜きたいページで（ページタブと紙の右クリック）。切り抜いたスクラップはスクラップトレイに入り、置くのはスクラップトレイから（ui.tsx）
import { pagedOf } from "../../../core/book"
import { bookType, type CatalogCheckDef, type CoreCatalog, type ItemId } from "../../../core/core-catalog"
import type { EditList } from "../../../core/def/book-type"
import type { ShapeData } from "../../../core/def/item"
import { problem } from "../../../core/errors"
import { findShape } from "../../../core/placed"
import { sameData } from "../../../core/same"
import type { Book } from "../../../core/schema/book"
import type { CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { placeableIn } from "../toolbox/toolbox"
import { SCRAP_CUT, type Scrap } from "./scrap"

// スクラップフレームの印（定義オブジェクトの拡張ポイントに書き足す）。true を書いた形は、スクラップトレイから置ける。
// 書けるのは、スクラップの値だけでそのまま項目になる形だけ（足す項目は省けるものに限る。スクラップトレイは、スクラップの値だけを項目にして置くため）
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

// scrapFrame を書いた形が、スクラップの値だけでそのまま項目になるか（台帳アセンブルのときの確かめ。スクラップの値が通り、値が変わらないこと）
const SAMPLE: Scrap = { page: "p", area: { x: 0, y: 0, w: 1, h: 1 }, scale: 1 }
export const SCRAP_FRAME_CHECK: CatalogCheckDef = catalog =>
  [...catalog.items.values()].flatMap(i => {
    if ((i as { scrapFrame?: unknown }).scrapFrame !== true) return []
    const parsed = i.kind === "shape" ? i.props.safeParse(SAMPLE) : undefined
    return parsed?.success && sameData(parsed.data, SAMPLE) ? [] : [problem("E127", { id: i.id })]
  })

// ブック book の、直している並び edits に置ける、スクラップフレームのアイテム（いくつもあれば、置ける物の並びの先頭。無ければ null）
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
    if (page) a.openDialog(SCRAP_CUT_DIALOG.id, { page })
  },
  when: ctx => ctx.book !== null && ctx.stage.opened?.page != null,
})

// 右クリックした形 item が、スクラップフレームなら、その項目のスクラップ（違えば null）
function scrapOf(ctx: CommandContext, item: string | undefined): Scrap | null {
  if (item === undefined) return null
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
  const placed = page && findShape(page, item)?.shape
  const def = placed && (ctx.catalog.items.get(placed.item) as { scrapFrame?: true } | undefined)
  return placed && def?.scrapFrame === true ? (placed.props as Scrap) : null
}

// 元のページを開く: 右クリックしたスクラップ（スクラップフレームの形）の、指すページを、このステージで開く。指す先が無ければ何もしない
export const SCRAP_OPEN_ORIGINAL = kit.defineCommand({
  id: "scrap-open-original",
  title: "Open the original page",
  run: (ctx, a, { item }: { item: string }) => {
    const scrap = scrapOf(ctx, item)
    if (scrap) a.openPageById(scrap.page)
  },
  // 右クリックのメニューでは、スクラップフレームの形のときだけ出す（行うときはメニューが閉じているので、形は run が確かめる）
  when: ctx => {
    const item = (ctx.contextMenu?.target as { item?: string } | undefined)?.item
    return item === undefined || scrapOf(ctx, item) !== null
  },
})
