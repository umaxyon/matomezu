// ファイルから画像のページを作る形（base の pageFromFile。図面・スライドや書庫に落とした画像を取り込むため）。作る所と受ける所は画像のフォルダで、
// アセットが同じ画像のページは同じ画像。名前はファイル名から拡張子を取った物。名前の無いファイル（貼り付け）は「画像 2026-11-27 14:05」のように、作った日時を付ける
import type { ItemPage, MessageKey } from "../../../../plugin-api"
import type { PageFromFile, PutAsset } from "../../../base"
import { assetOf, IMAGE, IMAGES } from "../image"
import { kit } from "../kit"

// 取り込むファイルの種類（中身で見分けるのはホスト）
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"] as const

// ファイル名から拡張子を取った名前（残らなければ空）
export const titleOfFile = (name: string): string => name.replace(/\.[^.]+$/, "").trim()

const two = (n: number) => String(n).padStart(2, "0")
// 名前の無いファイルの名前に付ける日時（その端末の時刻。2026-11-27 14:05）
const stamp = (d: Date) =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`

// 取り込めなかった訳（取り込みのダイアログと同じ文）
export const putRefusal = (reason: string): MessageKey =>
  kit.message(
    reason === "too-large"
      ? "It is larger than 25MB"
      : "It is not an image that can be imported (PNG, JPEG, GIF, WebP, SVG)",
  )

export const IMAGE_FROM_FILE = {
  type: IMAGE.id,
  into: IMAGES.id,
  accepts: (type: string): boolean => (IMAGE_TYPES as readonly string[]).includes(type),
  refusal: putRefusal,
  same: (page: ItemPage, asset: PutAsset): boolean => assetOf(page) === asset.asset,
  page: (file: File, asset: PutAsset, text: (key: MessageKey) => string): PageFromFile => ({
    title: titleOfFile(file.name) || `${text(kit.message("Image"))} ${stamp(new Date())}`,
    orientation: asset.width > asset.height ? "landscape" : "portrait",
    fields: { asset: asset.asset, width: asset.width, height: asset.height },
  }),
}
