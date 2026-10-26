// ex2 のブックのタイプ「フロー」: 自分の形（判断のひし形）と設定の項目（流れの向き）と自分のアクションを持ち、
// ビルトインの見せ方（紙）・箱・線・線の設定を id で選ぶ
import { BookLookSchema, type ShapeAddArgs, type ShapeEditArgs, z } from "matomezu"
import { kit } from "./kit"

export const DIAMOND_ADD_DIALOG = kit.defineDialogWith<ShapeAddArgs>()({ id: "diamond-add" })
export const DIAMOND_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "diamond-edit" })

const DIAMOND_SIZE = { w: 96, h: 64 }

// 判断のひし形: キャプションと答え（はい・いいえ・まだ）を持つ。大きさは置いたときの w・h（無ければ定義の大きさ）
export const DIAMOND = kit.defineShape({
  id: "diamond",
  kind: "shape",
  version: 1,
  title: "decision",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), answer: z.enum(["yes", "no"]).optional() }),
  size: DIAMOND_SIZE,
  min: DIAMOND_SIZE,
  sizeOf: d => ({ w: d.w ?? DIAMOND_SIZE.w, h: d.h ?? DIAMOND_SIZE.h }),
  captionWidth: () => DIAMOND_SIZE.w,
  dialogs: { add: DIAMOND_ADD_DIALOG.id, edit: DIAMOND_EDIT_DIALOG.id },
  tokens: [{ id: "diamond-fill", fallback: "fill" }],
})

// 判断に答える: ページの判断のひし形の答えを変える。ほかのアイテムなら断る
interface FlowPage {
  id: string
  items?: { id: string; item: string; props?: Record<string, unknown> }[]
}
export const ANSWER = kit.defineAction({
  id: "diamond-answer",
  title: "answerDecision",
  aiDescription:
    "Answer a decision (an item ex2/diamond) on a page: answer is yes or no. Refused when the item is not a decision on that page.",
  target: "book",
  needs: [],
  args: z.strictObject({ page: z.string().min(1), item: z.string().min(1), answer: z.enum(["yes", "no"]) }),
  run: (book, args) => {
    const pages = (book as unknown as { pages: FlowPage[] }).pages
    const page = pages.find(p => p.id === args.page)
    const item = page?.items?.find(i => i.id === args.item)
    if (!page || item?.item !== DIAMOND.id) return null
    const items = page.items?.map(i => (i === item ? { ...i, props: { ...i.props, answer: args.answer } } : i))
    const next = pages.map(p => (p === page ? { ...p, items } : p))
    return { next: { ...book, pages: next } as typeof book, result: {} }
  },
})

export const FLOW_DIRECTIONS = ["down", "right"] as const

// 流れの向き（ブックに持たせる）
export const FLOW_DIRECTION = kit.defineSetting({
  id: "flow-direction",
  title: "flowDirection",
  schema: z.enum(FLOW_DIRECTIONS),
  default: "down",
})

const FLOW_ACTIONS = [
  "@matomezu/base:page-add",
  "@matomezu/base:book-update",
  "@matomezu/base:page-update",
  "@matomezu/paper:item-place",
  "@matomezu/paper:item-move",
  "@matomezu/paper:item-update",
  "@matomezu/paper:item-resize",
  "@matomezu/paper:item-remove",
  "@matomezu/line:line-connect",
  "@matomezu/line:line-update",
  "@matomezu/line:line-reconnect",
  "ex2:diamond-answer",
] as const

export const FLOW = kit.defineBookType({
  id: "flow",
  version: 1,
  title: "flow",
  schema: z.strictObject({
    id: z.string().min(1),
    title: z.string(),
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["ex2:diamond", "@matomezu/box:shape-box", "@matomezu/line:connector-line"],
    defaults: ["ex2:diamond", "@matomezu/box:shape-box", "@matomezu/line:connector-line"],
  },
  actions: { allowed: FLOW_ACTIONS, defaults: FLOW_ACTIONS },
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["@matomezu/line:line-route", "ex2:flow-direction"], page: ["@matomezu/line:line-route"] },
})
