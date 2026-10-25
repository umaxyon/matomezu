// 追加プラグインのブックのタイプの見本: 自分の形（ひし形）と設定の項目（流れの向き）を持ち、ビルトインの見せ方（紙）・箱・線・線の設定を id で選ぶ

import { BookLookSchema, defineBookType, defineDialogWith, defineSetting, defineShape, type Point } from "matomezu"
import { z } from "zod"

export const DIAMOND_ADD_DIALOG = defineDialogWith<{ page: string; at: Point }>()({ id: "hoge-flow/diamond.add" })
export const DIAMOND_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "hoge-flow/diamond.edit" })

const DIAMOND_SIZE = { w: 96, h: 64 }

// ひし形: キャプションだけを持つ。大きさは置いたときの w・h（無ければ定義の大きさ）
export const DIAMOND = defineShape({
  id: "hoge-flow/diamond",
  kind: "shape",
  version: 1,
  title: "hoge diamond",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default("") }),
  size: DIAMOND_SIZE,
  min: DIAMOND_SIZE,
  sizeOf: d => ({ w: d.w ?? DIAMOND_SIZE.w, h: d.h ?? DIAMOND_SIZE.h }),
  captionWidth: () => DIAMOND_SIZE.w,
  dialogs: { add: DIAMOND_ADD_DIALOG.id, edit: DIAMOND_EDIT_DIALOG.id },
  tokens: [{ id: "hoge-flow/diamond.fill", fallback: "fill" }],
})

export const FLOW_DIRECTIONS = ["down", "right"] as const

// 流れの向き（ブックに持たせる）
export const FLOW_DIRECTION = defineSetting({
  id: "hoge-flow/flow.direction",
  title: "hoge flow direction",
  field: "hogeDirection",
  schema: z.enum(FLOW_DIRECTIONS),
  default: "down",
})

const FLOW_ACTIONS = [
  "page.add",
  "book.update",
  "page.update",
  "item.place",
  "item.move",
  "item.update",
  "item.resize",
  "item.remove",
  "line.connect",
  "line.update",
  "line.reconnect",
] as const

export const FLOW = defineBookType({
  id: "hoge-flow/flow",
  version: 1,
  title: "hoge flow",
  schema: z.strictObject({
    type: z.literal("hoge-flow/flow"),
    id: z.string().min(1),
    title: z.string(),
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ type: "hoge-flow/flow", ...init, pages: [] }),
  pages: {
    paper: { allowed: ["a4"], default: "a4", orientation: "portrait", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["hoge-flow/diamond", "shape.box", "connector.line"],
    defaults: ["hoge-flow/diamond", "shape.box", "connector.line"],
  },
  actions: { allowed: FLOW_ACTIONS, defaults: FLOW_ACTIONS },
  theme: "standard",
  presentation: "paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["line.route", "hoge-flow/flow.direction"], page: ["line.route"] },
})
