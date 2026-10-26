// ex4 の 2 つ目のつなぐもの「関係線」: 形どうしを点線で結ぶ。ビルトインの線と同じページに引ける。
// 整え（tidy）と関係の決まり（holds）を持たない（端の形を消したときに何が起きるかを見るため）
import { putPage, shapesOf, z } from "matomezu"
import { kit } from "./kit"

export const RELATION = kit.defineConnector({
  id: "relation",
  kind: "connector",
  version: 1,
  title: "relation",
  capabilities: [],
  toolbox: false,
  props: z.strictObject({ note: z.string().optional() }),
  tokens: [{ id: "relation-stroke", fallback: "text" }],
})

// 形 from と to を関係線で結ぶ。両端は同じページの形
export const RELATE = kit.defineAction({
  id: "relate",
  attach: { items: [kit.name("relation")] },
  title: "relate",
  aiDescription: "Join the items from and to (shapes on the same page) with a dotted relation line. Returns its id.",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), from: z.string().min(1), to: z.string().min(1) }),
  run: (book, args, ctx) => {
    const page = book.pages.find(p => p.id === args.page)
    if (!page) return null
    const shapes = new Set(shapesOf(page).map(s => s.id))
    if (!shapes.has(args.from) || !shapes.has(args.to)) return null
    const id = ctx.newId()
    const items = [...(page.items ?? []), { id, item: RELATION.id, from: args.from, to: args.to, props: {} }]
    return { next: putPage(book, { ...page, items }), result: { relation: id } }
  },
})

// 関係図: ビルトインの箱と線に、関係線を足したタイプ。関係線を先に選ぶ（つなぐものの層の外側になる）
export const MAP = kit.defineBookType({
  id: "map",
  version: 1,
  title: "map",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: [kit.name("relation"), "@matomezu/box:shape-box", "@matomezu/line:connector-line"],
    defaults: [kit.name("relation"), "@matomezu/box:shape-box", "@matomezu/line:connector-line"],
  },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  settings: { book: [], page: [] },
})
