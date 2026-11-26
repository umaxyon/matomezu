// 画像のフォルダの中と外を分ける認可ステップ in-images: 画像のページは画像のフォルダとその下だけに置き（外のフォルダ・ブックへ出さず、ほかの所には作らない）、
// ほかの物（ほかのタイプのページ・ブック・バインダ）は中へ入れない。フォルダは中で作り、中で動かせるが、外との間では動かさない。ゴミ箱へは出せ、ゴミ箱から元の所へ戻せる。
// 行う前の問いは見せ方のためで、守るのは行った後の確かめ（置き場所の確かめと、ブックの確かめ）
import { findPage, type PermissionDef } from "../../../plugin-api"
import { IMAGE, underImages } from "./image"
import { kit } from "./kit"

type Query = Parameters<PermissionDef["denies"]>[0]
type Check = Parameters<NonNullable<PermissionDef["keeps"]>>[0]

const isImagePage = (e: { kind: string; pageType?: string }): boolean => e.kind === "page" && e.pageType === IMAGE.id

// 行う前: 置き場所の問い（入れる先が画像のフォルダの中か外か）と、ブックに画像のページを作る問い
function denies(q: Query): boolean {
  if (q.kind === "place") {
    const inside = underImages(q.into)
    if (isImagePage(q.entry)) return !inside
    // 在るフォルダは、画像のフォルダの中で動かすこともある（どこから来たかは、行った後の確かめで分かる）
    return inside && q.entry.kind !== "folder"
  }
  return q.kind === "folder" && q.where !== undefined && "creates" in q.where && q.where.creates === IMAGE.id
}

// 行った後: 直の入れ物が変わった物ごとの、前と後が画像のフォルダの中か外か。ブックに画像のページが入っていないか
function keeps(c: Check): boolean {
  if (c.kind === "place") {
    const after = underImages(c.after)
    if (isImagePage(c.entry)) return c.after === "none" || after
    if (c.entry.kind !== "folder") return !after
    // フォルダ: ゴミ箱へ出す・作る・ゴミ箱から戻すのはよい。ほかは中と外を行き来しない
    return c.after === "none" || c.before === "none" || after === underImages(c.before)
  }
  if (c.kind !== "folder" || !c.after) return true
  const book = c.after
  return !c.changes.pages.some(p => {
    if (p.change !== "added" && p.change !== "movedIn") return false
    const found = findPage(book, p.id)
    return typeof found === "object" && found.page.type === IMAGE.id
  })
}

export const IN_IMAGES = kit.definePermission({
  id: "in-images",
  title: "Images stay in the images folder",
  aiDescription:
    "image pages are only in the images folder and in its folders (not in books or other folders), and nothing else goes in the images folder",
  denies,
  keeps,
})
