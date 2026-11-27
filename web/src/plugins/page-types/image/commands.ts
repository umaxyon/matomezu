// 書庫の右クリックのメニューから呼ぶ、画像のプラグインのコマンド（スクリーンから呼ぶコマンド）。受け取る物は、書庫のメニューと同じ形（右クリックした物 entry か、何も無い所のメニューのフォルダ folder）。
// 画像を取り込む: 画像のフォルダかその下のフォルダで、取り込むダイアログ（ファイルを選ぶ窓）を開く。画像のフォルダの外では出さない
// スクラップを作る: 右クリックした画像のページの、画像全体を倍率 1 で見るスクラップをスクラップトレイに入れる（base の scrap-cut）。画像のフォルダの外のページには出さない
import { NO_PAGE, type ScreenCommandContext } from "../../../plugin-api"
import { refusalMessage, type Scrap, wholeScrapOf } from "../../base"
import { IMAGE, IMPORT_IMAGES_DIALOG, inImages } from "./image"
import { kit } from "./kit"

type Named = ({ entry: string } | { folder: string }) & object

const PAGE_CREATE = "@matomezu/base:page-create"
const PAGE_CREATE_OVER = "@matomezu/base:page-create-over"
const SCRAP_CUT = "@matomezu/base:scrap-cut"

// 取り込む先のフォルダ（受け取った物が、画像のフォルダかその下のフォルダでなければ空）
const intoOf = (ctx: ScreenCommandContext, named: Named | undefined): string => {
  const id = !named ? undefined : "entry" in named ? named.entry : "folder" in named ? named.folder : undefined
  return id !== undefined && inImages(ctx.folders, id) ? id : ""
}

export const IMPORT_IMAGES = kit.defineScreenCommand({
  id: "import-images",
  title: "Import images…",
  performs: [PAGE_CREATE, PAGE_CREATE_OVER], // 開いたダイアログが行う（名前が重なって上書きを選べば page-create-over）
  run: (ctx, a, named: Named | undefined) => {
    const folder = intoOf(ctx, named)
    if (folder !== "") a.openDialog(IMPORT_IMAGES_DIALOG.id, { type: IMAGE.id, folder })
  },
  performsWith: (ctx, named) => {
    const folder = intoOf(ctx, named)
    return folder === "" ? [] : [{ action: PAGE_CREATE, args: { folder, type: IMAGE.id } }]
  },
  when: () => true,
  accepts: (ctx, named) => intoOf(ctx, named) !== "",
})

// 右クリックした物から作るスクラップ（開ける画像のページでなければ null。画像のページは画像のフォルダとその下にだけ在る: in-images）
function scrapOfEntry(ctx: ScreenCommandContext, named: Named | undefined): Scrap | null {
  const id = named && "entry" in named ? named.entry : undefined
  if (id === undefined) return null
  const page = ctx.pageOf(id)
  return page === NO_PAGE || page.type !== IMAGE.id ? null : wholeScrapOf(ctx.catalog, id, page)
}

export const SCRAP_MAKE = kit.defineScreenCommand({
  id: "scrap-make",
  title: "Make a scrap",
  performs: [SCRAP_CUT],
  run: (ctx, a, named: Named | undefined) => {
    const scrap = scrapOfEntry(ctx, named)
    if (!scrap) return
    const done = a.perform(SCRAP_CUT, scrap)
    a.showToast(
      done.ok
        ? { kind: "success", message: kit.message("Put in the scrap tray") }
        : { kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Make a scrap")) },
    )
  },
  when: () => true,
  accepts: (ctx, named) => scrapOfEntry(ctx, named) !== null,
})
