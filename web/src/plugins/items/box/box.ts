// 箱: キャプションと本文を入れる四角。キャプションと本文の間に区切り線を引ける（本文があるときだけ）。
// 幅と高さは置いたアイテムの w・h で、利用者が変える（size.ts）。本文は高さに収まらない分を … で切る（本文の字数は BODY_MAX まで）。
// 色（color）はテーマの上の塗りの上書き: 代表色の名前ならそのテーマの色、#rrggbb ならどのテーマでもその色、無ければテーマの塗り（paint.ts）。
// 置くときは、置く所を覚えて追加のダイアログ（box-add）を開き、中身を決めてから置く。中身は編集のダイアログ（box-edit）で変える
import { z } from "zod"
import { HEX, PALETTE, type ShapeAddArgs, type ShapeEditArgs } from "../../../plugin-api"
import { textProps } from "../../base"
import { kit } from "./kit"
import { BOX_MIN, BOX_SIZE, placedHeight, placedWidth } from "./size"

// 箱の塗りの欄（色の見本の「なし」もこの色）
export const BOX_FILL = { id: "box-fill", fallback: "fill" } as const

// 箱の追加のダイアログ。開いたステージのブックの、ページ page の at（紙の上の左上）に置く
export const BOX_ADD_DIALOG = kit.defineDialogWith<ShapeAddArgs>()({ id: "box-add" })

// 箱の編集のダイアログ。開いたステージのブックの、ページ page の箱 item の中身を変える
export const BOX_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "box-edit" })

export const BoxPropsSchema = z.strictObject({
  ...textProps("center"), // キャプション・区切り線・本文と寄せ（キャプションは中央寄せ）
  theme: z.string().min(1).optional(), // 箱に当てるテーマの id（無ければブックのテーマ）
  color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 塗りの色（代表色の名前か #rrggbb。無ければテーマの塗り）
})

// 大きさは w・h（無ければキャプションの幅と、本文が 5 行まで見える高さ）
export const BOX = kit.defineShape({
  id: "shape-box",
  kind: "shape",
  version: 1,
  title: "Box",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: BoxPropsSchema,
  size: BOX_SIZE, // 幅の既定と、置いたときの一番低い高さ
  min: BOX_MIN,
  sizeOf: box => {
    const w = box.w ?? placedWidth(box.props)
    return { w, h: box.h ?? placedHeight(box.props, w) }
  },
  captionWidth: box => placedWidth(box.props),
  dialogs: { add: BOX_ADD_DIALOG.id, edit: BOX_EDIT_DIALOG.id },
  tokens: [
    BOX_FILL,
    { id: "box-line", value: "#cdcdd6" }, // 枠線（標準は淡い灰色。テーマが上書きする）
    { id: "box-text", fallback: "text" },
    { id: "box-radius", value: "8px" }, // 角の丸み
    { id: "box-shadow", value: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.14))" }, // 影（CSS の filter の値。標準は薄い影）
    { id: "box-fold", value: "0px" }, // 右上の角を折り返す大きさ（付箋）
  ],
})
