// 箱: キャプションと本文を入れる四角。キャプションと本文の間に区切り線を引ける（本文があるときだけ）。
// 幅と高さは置いたアイテムの w・h で、利用者が変える（size.ts）。本文は高さに収まらない分を … で切る（本文の字数は BOX_BODY_MAX まで）。
// 置くときは、置く所を覚えて追加のダイアログ（box.add）を開き、中身を決めてから置く。中身は編集のダイアログ（box.edit）で変える
import { z } from "zod"
import { defineItem } from "../../../../core/def/item"
import type { Point } from "../../../../core/geom"
import { defineDialogWith } from "../../../../store/dialogs"
import { BOX_BODY_MAX, BOX_SIZE } from "./size"

export const BOX = defineItem({
  id: "shape.box",
  kind: "shape",
  version: 1,
  title: "Box",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({
    caption: z.string().default(""),
    rule: z.boolean().default(true), // キャプションと本文の間の区切り線
    body: z.string().max(BOX_BODY_MAX).default(""),
  }),
  size: BOX_SIZE, // 幅の既定と、置いたときの一番低い高さ
  tokens: [
    { id: "box.fill", fallback: "fill" },
    { id: "box.line", fallback: "line" },
    { id: "box.text", fallback: "text" },
  ],
})

// 箱の追加のダイアログ。開いたステージのブックの、ページ page の at（紙の上の左上）に置く
export const BOX_ADD_DIALOG = defineDialogWith<{ page: string; at: Point }>()({ id: "box.add" })

// 箱の編集のダイアログ。開いたステージのブックの、ページ page の箱 item の中身を変える
export const BOX_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "box.edit" })
