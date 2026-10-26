// ex5 の形「タイル」: 色の札（tiles）を並べる入れ物。文字は持たない（hasText なし）。
// 項目に自分の意味の theme（札の色合い）と caption（札の並びの名前。編集はしない）を持ち、中身の欄は children でなく tiles
import { putPage, z } from "matomezu"
import { kit } from "./kit"

const TILES_SIZE = { w: 160, h: 96 }

export const TILES = kit.defineShape({
  id: "tiles",
  kind: "shape",
  version: 1,
  title: "tiles",
  capabilities: ["resizable"],
  toolbox: true,
  props: z.strictObject({
    theme: z.enum(["warm", "cool"]).optional(), // 既定を持たせると、監査 B1 で置けなくなる
    caption: z.string().default(""),
  }),
  content: { tiles: z.array(z.strictObject({ id: z.string().min(1), color: z.string() })) },
  size: TILES_SIZE,
  min: { w: 80, h: 48 },
  tokens: [{ id: "tiles-fill", fallback: "fill" }],
})

// タイルに札を 1 枚足す
export const TILE_ADD = kit.defineAction({
  id: "tile-add",
  attach: { items: [kit.name("tiles")] },
  title: "addTile",
  aiDescription: "Add a tile of color (#rrggbb) at the end of the item (an ex5:tiles). Returns the tile's id.",
  target: "book",
  needs: [],
  args: z.strictObject({ page: z.string().min(1), item: z.string().min(1), color: z.string() }),
  run: (book, args, ctx) => {
    const page = book.pages.find(p => p.id === args.page)
    const item = page?.items?.find(i => i.id === args.item)
    if (!page || item?.item !== TILES.id) return null
    const id = ctx.newId()
    const tiles = [...(item.tiles ?? []), { id, color: args.color }]
    const items = page.items?.map(i => (i === item ? { ...item, tiles } : i))
    return { next: putPage(book, { ...page, items }), result: { tile: id } }
  },
})

// 棚の図: タイルとビルトインの箱を置くタイプ
export const SHELF = kit.defineBookType({
  id: "shelf",
  version: 1,
  title: "shelf",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: [kit.name("tiles"), "@matomezu/box:shape-box"],
    defaults: [kit.name("tiles"), "@matomezu/box:shape-box"],
  },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["@matomezu/base:book-theme"], page: [] },
})
