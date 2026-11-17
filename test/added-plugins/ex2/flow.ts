// ex2 のページのタイプ「フロー」: 自分の形（判断のひし形）と設定の項目（流れの向き）と自分のアクションを持ち、
// ビルトインのプレゼンテーション（紙）・箱・線・線の設定を id で選ぶ

import { type ShapeAddArgs, type ShapeEditArgs, z } from "matomezu"
import { kit } from "./kit"

export const DIAMOND_ADD_DIALOG = kit.defineDialogWith<ShapeAddArgs>()({ id: "diamond-add" })
export const DIAMOND_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "diamond-edit", edits: a => [a.item] })

const DIAMOND_SIZE = { w: 96, h: 64 }

// 判断のひし形: キャプションと答え（はい・いいえ・まだ）を持つ。大きさは置いたときの w・h（無ければ定義の大きさ）
export const DIAMOND = kit.defineShape({
  id: "diamond",
  kind: "shape",
  version: 1,
  title: "decision",
  capabilities: ["connectable", "resizable"],
  captionProp: "caption",
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), answer: z.enum(["yes", "no"]).optional() }),
  size: DIAMOND_SIZE,
  min: DIAMOND_SIZE,
  dialogs: { add: DIAMOND_ADD_DIALOG.id, edit: DIAMOND_EDIT_DIALOG.id },
  tokens: [{ id: "diamond-fill", fallback: "fill" }],
})

// 判断に答える: ページの判断のひし形の答えを変える。ほかのアイテムなら断る
export const ANSWER = kit.defineAction({
  id: "diamond-answer",
  attach: { items: [kit.name("diamond")] }, // 判断のひし形を置けるタイプで使える
  title: "answerDecision",
  aiDescription:
    "Answer a decision (an item ex2/diamond) on a page: answer is yes or no. Refused when the item is not a decision on the page.",
  target: "page",
  args: z.strictObject({ item: z.string().min(1), answer: z.enum(["yes", "no"]) }),
  permissionScope: { item: "item" },
  run: (page, args) => {
    const item = page.items?.find(i => i.id === args.item)
    if (item?.item !== DIAMOND.id) return null
    const items = page.items?.map(i => (i === item ? { ...item, props: { ...item.props, answer: args.answer } } : i))
    return { next: { ...page, items }, result: {} }
  },
})

export const FLOW_DIRECTIONS = ["down", "right"] as const

// 流れの向き（ブックに持たせる）
export const FLOW_DIRECTION = kit.defineSetting({
  id: "flow-direction",
  holder: "page",
  title: "flowDirection",
  schema: z.enum(FLOW_DIRECTIONS),
  default: "down",
})

export const FLOW = kit.definePageType({
  id: "flow",
  version: 1,
  title: "flow",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait" },
  items: {
    allowed: [DIAMOND.id, "@matomezu/box:shape-box", "@matomezu/line:connector-line"],
  },
  actions: {}, // 使うアクションは、選んだアイテム・プレゼンテーション・ページについて来る（自分の判断のアクションも、ひし形について来る）
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "@matomezu/paper:paper",
  settings: ["@matomezu/base:page-theme", "@matomezu/line:line-route", FLOW_DIRECTION.id],
})
