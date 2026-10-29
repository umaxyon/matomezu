// ex5 の形「タイル」: 色の札（tiles）を並べる入れ物。文字は持たない（captionProp なし）。
// 項目に自分の意味の theme（札の色合い）と caption（札の並びの名前。編集はしない）を持ち、中身のフィールドは children でなく tiles
import { hasPages, putPage, z } from "matomezu"
import { kit } from "./kit"

const TILES_SIZE = { w: 160, h: 96 }

export const TILES = kit.defineShape({
  id: "tiles",
  kind: "shape",
  version: 1,
  title: "tiles",
  capabilities: ["resizable", kit.name("stackable")], // 自分で足した能力（index.ts の CapabilityTable）
  toolbox: true,
  props: z.strictObject({
    theme: z.enum(["warm", "cool"]).default("warm"), // 札の色合い（個別のテーマではないので themeProp は書かない）
    caption: z.string().default(""),
  }),
  content: { tiles: z.array(z.strictObject({ id: z.string().min(1), color: z.string() })) },
  size: TILES_SIZE,
  min: { w: 80, h: 48 },
  tokens: [], // テーマキーはプラグインが持つ（index.ts。いくつものアイテムで共に使う形の見本）
})

// タイルのテーマキー（プラグインが持つ。id は kit.name で長い形に書く）
export const TILES_TOKENS = [{ id: kit.name("tiles-fill"), fallback: "fill" }] as const

// タイルに札を 1 枚足す
export const TILE_ADD = kit.defineAction({
  id: "tile-add",
  attach: { items: [kit.name("tiles")] },
  title: "addTile",
  aiDescription: "Add a tile of color (#rrggbb) at the end of the item (an ex5:tiles). Returns the tile's id.",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), item: z.string().min(1), color: z.string() }),
  permissionScope: { page: "page", item: "item" },
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

// 札の数の上限（自分の認可ステップの見本）: 1 ページの札が TILE_LIMIT 枚になったら、そのページに札を足すことを止める。
// 行う前に止めるのは自分のアクションだけ。行った後は、どのアクションでも上限を超えたら止める
const TILE_LIMIT = 6
type TilesPage = { id: string; items?: readonly { tiles?: readonly unknown[] }[] }
const tilesOn = (page: TilesPage | undefined) => (page?.items ?? []).reduce((n, i) => n + (i.tiles?.length ?? 0), 0)

export const TILE_LIMIT_PERMISSION = kit.definePermission({
  id: "tile-limit",
  title: "tileLimit",
  aiDescription: `a page can hold at most ${TILE_LIMIT} tiles; make a new page for more`,
  denies: ({ action, book, where }) =>
    action.id === TILE_ADD.id &&
    hasPages(book) &&
    tilesOn((book.pages as readonly TilesPage[]).find(p => p.id === where?.page)) >= TILE_LIMIT,
  // 札を足すほかのアクションも、行った後の変化で止める（変わったページの札が上限を超えたら守っていない）
  keeps: ({ after, changes }) =>
    !after ||
    !hasPages(after) ||
    changes.pages.every(c => tilesOn((after.pages as readonly TilesPage[]).find(p => p.id === c.id)) <= TILE_LIMIT),
})

// 仕分けの道具（自分の道具の見本。ドラッグで紙をずらさず、置く道具でもない）と、ビルトインの選択とハンドに挟んだ棚の道具の組
export const SORT_TOOL = kit.defineTool({ id: "sort", title: "sortTool" })
export const SHELF_TOOLS = kit.defineToolSet({
  id: "shelf-tools",
  tools: ["@matomezu/base:select", kit.name("sort"), "@matomezu/base:hand"],
})

// 棚の図: タイルとビルトインの箱を置くタイプ
export const SHELF = kit.defineBookType({
  id: "shelf",
  version: 1,
  title: "shelf",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: {
    allowed: [kit.name("tiles"), "@matomezu/box:shape-box"],
    defaults: [kit.name("tiles"), "@matomezu/box:shape-box"],
  },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: kit.name("shelf-tools"),
  settings: { book: ["@matomezu/base:book-theme"], page: [] },
})
