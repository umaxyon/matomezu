// ツリーのコマンド: 上下左右のキーで、選んでいる節を動かす（伸びる向きのキーで最初の子へ、逆向きで親へ、横向きで隣の兄弟へ）。
// 編集の道具の間だけ。キーはツリーの見せ方の範囲（ステージの範囲より先に探す）
import { pagedOf } from "../../../plugin-api"
import { settingValue } from "../../base"
import { type Arrow, moveFrom, selectedIn } from "./edit"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { EDIT_TOOL } from "./tools"
import { TREE_KEYS_SCOPE } from "./tree"

export const NODE_SELECT_MOVE = kit.defineCommand({
  id: "node-select-move",
  title: "Move selection",
  run: (ctx, a, args: { to: Arrow }) => {
    const book = pagedOf(ctx.book)
    const page = book?.pages.find(p => p.id === ctx.stage.opened?.page)
    const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
    if (!book || !page || !root.success) return
    const grow = settingValue(ctx.catalog, book, page, GROW.id) as Grow
    a.select(ctx.stage.id, [moveFrom(root.data, grow, selectedIn(root.data, ctx.stage.selection), args.to)])
  },
  when: ctx => ctx.stage.tool === EDIT_TOOL.id && ctx.stage.opened?.page != null,
})

export const TREE_KEYS = [
  kit.defineKey({
    id: "node-select-up",
    key: "ArrowUp",
    command: NODE_SELECT_MOVE.id,
    args: { to: "up" },
    scope: TREE_KEYS_SCOPE,
  }),
  kit.defineKey({
    id: "node-select-down",
    key: "ArrowDown",
    command: NODE_SELECT_MOVE.id,
    args: { to: "down" },
    scope: TREE_KEYS_SCOPE,
  }),
  kit.defineKey({
    id: "node-select-left",
    key: "ArrowLeft",
    command: NODE_SELECT_MOVE.id,
    args: { to: "left" },
    scope: TREE_KEYS_SCOPE,
  }),
  kit.defineKey({
    id: "node-select-right",
    key: "ArrowRight",
    command: NODE_SELECT_MOVE.id,
    args: { to: "right" },
    scope: TREE_KEYS_SCOPE,
  }),
]
