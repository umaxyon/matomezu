// 絵の形のアイテム: 決まった大きさの絵（pictures.ts）と、その足元に折り返すキャプションを持つ形。15 の絵ごとに 1 つのアイテム。
// 項目はキャプションと色（代表色の名前か #rrggbb。無ければテーマの絵の色）。大きさは幅だけを利用者が変え、高さは中身から決まる（size.ts）。
// 道具箱では形のパネルに並べる。置くときは絵ごとの追加のダイアログでキャプションと色を聞いてから置き、中身は 1 つの編集のダイアログで変える。
// 線は絵とキャプションを合わせた四角のふちにつなぐ
import { z } from "zod"
import { HEX, type MessageKey, PALETTE, type ShapeAddArgs, type ShapeEditArgs } from "../../../plugin-api"
import { kit } from "./kit"
import type { ART_MESSAGES } from "./messages"
import { PICTURES, type PictureName } from "./pictures"
import { ART_LOOK, artSize, minWidth } from "./size"

export const ART_FILL = { id: kit.name("art-fill"), fallback: "fill" } as const
// 15 の絵で共通のテーマキー（プラグインが持つ。絵の形のアイテムは自分のテーマキーを持たない）
export const ART_TOKENS = [
  ART_FILL,
  { id: kit.name("art-line"), value: "#5f5f6b" }, // 絵の線と印
  { id: kit.name("art-text"), fallback: "text" }, // キャプションと、色の無いスティックマン
] as const

export const ArtPropsSchema = z.strictObject({
  caption: z.string().default(""),
  color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 絵の色（代表色の名前か #rrggbb。無ければテーマの絵の色）
})

// 編集のダイアログ（どの絵も同じ）
export const ART_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "art-edit" })

// 絵 1 つの定義と、その追加のダイアログ（置く絵は道具箱で決まっているので、絵ごとに 1 つ）
function art<const Name extends PictureName, const Title extends keyof typeof ART_MESSAGES & string>(
  name: Name,
  title: Title,
) {
  const picture = PICTURES[name]
  const add = kit.defineDialogWith<ShapeAddArgs>()({ id: `${name}-add` })
  const item = kit.defineShape({
    id: `shape-${name}`,
    kind: "shape",
    version: 1,
    title,
    capabilities: ["connectable", "resizable"],
    captionProp: "caption",
    toolbox: "panel",
    props: ArtPropsSchema,
    size: artSize(picture, "", undefined),
    min: { w: minWidth(picture), h: 2 * ART_LOOK.padY + picture.size.h },
    sizeOf: s => artSize(picture, s.props.caption, s.w),
    // キャプションで幅は広げず（折り返す）、行が増えたら縦に広げる
    captionWidth: () => minWidth(picture),
    captionHeight: s => artSize(picture, s.props.caption, s.w).h,
    "@matomezu/paper:stretch": "width",
    "@matomezu/paper:settle": s => ({ ...s, h: artSize(picture, s.props.caption, s.w).h }),
    dialogs: { add: add.id, edit: ART_EDIT_DIALOG.id },
    tokens: [],
  })
  return { item, add, name, title: title as MessageKey }
}

export const PERSON = art("person", "Stick figure")
export const DB = art("db", "Database")
export const SERVER = art("server", "Server")
export const PC = art("pc", "Computer")
export const FACTORY = art("factory", "Factory")
export const DOCUMENT = art("document", "Document")
export const TRASH = art("trash", "Trash")
export const ROBOT = art("robot", "Robot")
export const CAT = art("cat", "Cat")
export const HEART = art("heart", "Heart")
export const BULB = art("bulb", "Light bulb")
export const DOG = art("dog", "Dog")
export const FOREST = art("forest", "Forest")
export const HOUSE = art("house", "House")
export const FAMILY = art("family", "Family")

export const ARTS = [
  PERSON,
  DB,
  SERVER,
  PC,
  FACTORY,
  DOCUMENT,
  TRASH,
  ROBOT,
  CAT,
  HEART,
  BULB,
  DOG,
  FOREST,
  HOUSE,
  FAMILY,
] as const

// 絵の形のアイテムの id（道具箱に並べる順）
export const ART_ITEMS = ARTS.map(a => a.item.id)
