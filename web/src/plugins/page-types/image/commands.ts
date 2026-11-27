// 画像を取り込むコマンド（書庫の右クリックのメニューから呼ぶ。スクリーンから呼ぶコマンド）: 画像のフォルダかその下のフォルダで、取り込むダイアログ（ファイルを選ぶ窓）を開く。
// 受け取る物は、書庫のメニューと同じ形（右クリックした物 entry か、何も無い所のメニューのフォルダ folder）。画像のフォルダの外では出さない
import type { ScreenCommandContext } from "../../../plugin-api"
import { IMAGE, IMPORT_IMAGES_DIALOG, inImages } from "./image"
import { kit } from "./kit"

type Named = ({ entry: string } | { folder: string }) & object

const PAGE_CREATE = "@matomezu/base:page-create"
const PAGE_CREATE_OVER = "@matomezu/base:page-create-over"

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
