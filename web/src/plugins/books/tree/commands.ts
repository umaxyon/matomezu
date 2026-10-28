// ツリーのコマンド: 上下左右のキーで、選んでいる節を動かす（伸びる向きのキーで最初の子へ、逆向きで親へ、横向きで隣の兄弟へ）と、
// Enter で、選んでいる節のキャプションをその場で書き始める。編集の道具の間だけ。キーはツリーの見せ方の範囲（ステージの範囲より先に探す）
import { type CommandContext, pagedOf } from "../../../plugin-api"
import { settingValue } from "../../base"
import { type Arrow, moveFrom, selectedIn } from "./edit"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { EDIT_TOOL } from "./tools"
import { TREE_KEYS_SCOPE } from "./tree"

// 開いているページと、その根（ツリーのページでなければ null）
function treeAt(ctx: CommandContext) {
  const book = pagedOf(ctx.book)
  const page = book?.pages.find(p => p.id === ctx.stage.opened?.page)
  const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
  return book && page && root.success ? { book, page, root: root.data } : null
}

const editingTree = (ctx: CommandContext) => ctx.stage.tool === EDIT_TOOL.id && ctx.stage.opened?.page != null

export const NODE_SELECT_MOVE = kit.defineCommand({
  id: "node-select-move",
  title: "Move selection",
  run: (ctx, a, args: { to: Arrow }) => {
    const tree = treeAt(ctx)
    if (!tree) return
    const grow = settingValue(ctx.catalog, tree.book, tree.page, GROW.id) as Grow
    a.select(ctx.stage.id, [moveFrom(tree.root, grow, selectedIn(tree.root, ctx.stage.selection), args.to)])
  },
  when: editingTree,
})

// 選んでいる節（何も選んでいなければ根）を、その場で編集し始める
export const NODE_EDIT = kit.defineCommand({
  id: "node-edit",
  title: "Edit caption",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    if (!tree) return
    a.select(ctx.stage.id, [selectedIn(tree.root, ctx.stage.selection)])
    a.setEditing(ctx.stage.id, true)
  },
  when: editingTree,
})

export const TREE_KEYS = [
  kit.defineKey({ id: "node-edit-enter", key: "Enter", command: NODE_EDIT.id, scope: TREE_KEYS_SCOPE }),
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
