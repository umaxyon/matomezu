// ファイルから画像のページを作る（base の pageFromFile。図面・スライドに落とした画像を、スクラップにして置くため）。
// 中身が同じ画像のページが開ける所（画像のフォルダとその下）に在れば、作らずにそれを使う。無ければ画像のフォルダの直下に作る（名前が重なれば base が番号を付ける）。
// 名前はファイル名から拡張子を取った物。名前の無いファイル（貼り付け）は「画像 2026-11-27 14:05」のように、作った日時を付ける
import type { MessageKey } from "../../../../plugin-api"
import type { PageFromFileUse } from "../../../base"
import { assetOf, IMAGE, isImagesFolder } from "../image"
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
  accepts: (type: string): boolean => (IMAGE_TYPES as readonly string[]).includes(type),
  make: async (file: File, use: PageFromFileUse): Promise<string | null> => {
    const named = titleOfFile(file.name)
    const shown = file.name || use.text(kit.message("Image"))
    const done = await use.putAsset(file).catch(() => null)
    if (!done) {
      use.refuse(shown, kit.message("The server could not take it"))
      return null
    }
    if (!done.ok) {
      use.refuse(shown, putRefusal(done.reason))
      return null
    }
    const same = use.findPage(p => p.type === IMAGE.id && assetOf(p) === done.asset)
    if (same !== null) return same
    const root = Object.entries(use.folders).find(([, f]) => isImagesFolder(f))?.[0]
    if (root === undefined) return null
    return use.createPage(root, {
      type: IMAGE.id,
      title: named || `${use.text(kit.message("Image"))} ${stamp(new Date())}`,
      orientation: done.width > done.height ? "landscape" : "portrait",
      fields: { asset: done.asset, width: done.width, height: done.height },
    })
  },
}
