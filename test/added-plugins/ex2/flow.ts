// ex2 のブックのタイプ「フロー」: 自分の形（判断のひし形）と設定の項目（流れの向き）と自分のアクションを持ち、
// ビルトインの見せ方（紙）・箱・線・線の設定を id で選ぶ
import {
  BookLookSchema,
  defineAction,
  defineBookType,
  defineDialogWith,
  defineSetting,
  defineShape,
  type Point,
  z,
} from "matomezu"

export const DIAMOND_ADD_DIALOG = defineDialogWith<{ page: string; at: Point }>()({ id: "ex2/diamond.add" })
export const DIAMOND_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "ex2/diamond.edit" })

const DIAMOND_SIZE = { w: 96, h: 64 }

// 判断のひし形: キャプションと答え（はい・いいえ・まだ）を持つ。大きさは置いたときの w・h（無ければ定義の大きさ）
export const DIAMOND = defineShape({
  id: "ex2/diamond",
  kind: "shape",
  version: 1,
  title: "Decision",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), answer: z.enum(["yes", "no"]).optional() }),
  size: DIAMOND_SIZE,
  min: DIAMOND_SIZE,
  sizeOf: d => ({ w: d.w ?? DIAMOND_SIZE.w, h: d.h ?? DIAMOND_SIZE.h }),
  captionWidth: () => DIAMOND_SIZE.w,
  dialogs: { add: DIAMOND_ADD_DIALOG.id, edit: DIAMOND_EDIT_DIALOG.id },
  tokens: [{ id: "ex2/diamond.fill", fallback: "fill" }],
})

// 判断に答える: ページの判断のひし形の答えを変える。ほかのアイテムなら断る
interface FlowPage {
  id: string
  items?: { id: string; item: string; props?: Record<string, unknown> }[]
}
export const ANSWER = defineAction({
  id: "ex2/diamond.answer",
  title: "Answer decision",
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
export const FLOW_DIRECTION = defineSetting({
  id: "ex2/flow.direction",
  title: "Flow direction",
  field: "ex2Direction",
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
  "ex2/diamond.answer",
] as const

export const FLOW = defineBookType({
  id: "ex2/flow",
  version: 1,
  title: "Flow",
  schema: z.strictObject({
    type: z.literal("ex2/flow"),
    id: z.string().min(1),
    title: z.string(),
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ type: "ex2/flow", ...init, pages: [] }),
  pages: {
    paper: { allowed: ["a4"], default: "a4", orientation: "portrait", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["ex2/diamond", "shape.box", "connector.line"],
    defaults: ["ex2/diamond", "shape.box", "connector.line"],
  },
  actions: { allowed: FLOW_ACTIONS, defaults: FLOW_ACTIONS },
  theme: "standard",
  presentation: "paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["line.route", "ex2/flow.direction"], page: ["line.route"] },
})
