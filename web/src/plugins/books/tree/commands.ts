// ツリーのコマンド: 上下左右のキーで、選んでいる節を動かす（伸びる向きのキーで最初の子へ、逆向きで親へ、横向きで隣の兄弟へ）と、
// Enter で、選んでいる節のキャプションをその場で書き始める。Delete（Backspace）と節の右クリックのメニューで、選んでいる節を子孫ごと消す（根は消せない。
// 消したら、前の兄弟、無ければ親を選ぶ）。節の右クリックのメニューで、子の節の大きさのダイアログを開く。編集の道具の間だけ。キーはツリーの見せ方の範囲（ステージの範囲より先に探す）
import { type CommandContext, pagedOf } from "../../../plugin-api"
import { settingValue } from "../../base"
import { NODE_REMOVE, NODE_UPDATE } from "./actions"
import { type Arrow, afterRemove, moveFrom, selectedIn } from "./edit"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { EDIT_TOOL } from "./tools"
import { NODE_SIZE_DIALOG, TREE_KEYS_SCOPE } from "./tree"

// 開いているページと、その根と伸びる向き（ツリーのページでなければ null）
function treeAt(ctx: CommandContext) {
  const book = pagedOf(ctx.book)
  const page = book?.pages.find(p => p.id === ctx.stage.opened?.page)
  const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
  if (!book || !page || !root.success) return null
  return { book, page, root: root.data, grow: settingValue(ctx.catalog, book, page, GROW.id) as Grow }
}

const editingTree = (ctx: CommandContext) => ctx.stage.tool === EDIT_TOOL.id && ctx.stage.opened?.page != null

export const NODE_SELECT_MOVE = kit.defineCommand({
  id: "node-select-move",
  title: "Move selection",
  run: (ctx, a, args: { to: Arrow }) => {
    const tree = treeAt(ctx)
    if (!tree) return
    a.select(ctx.stage.id, [moveFrom(tree.root, tree.grow, selectedIn(tree.root, ctx.stage.selection), args.to)])
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

// 選んでいる節を子孫ごと消し、前の兄弟（無ければ親）を選ぶ（根を選んでいるときと、その場の編集中は出さない）
export const NODE_DELETE = kit.defineCommand({
  id: "node-delete",
  performs: [NODE_REMOVE.id],
  title: "Delete",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    const opened = ctx.stage.opened
    if (!tree || !opened) return
    const node = selectedIn(tree.root, ctx.stage.selection)
    const next = afterRemove(tree.root, tree.grow, node)
    if (!next) return
    if (a.perform(NODE_REMOVE.id, { page: tree.page.id, node }, { book: opened.book }).ok)
      a.select(ctx.stage.id, [next])
  },
  when: ctx => {
    const tree = editingTree(ctx) && !ctx.stage.editing ? treeAt(ctx) : null
    return tree !== null && selectedIn(tree.root, ctx.stage.selection) !== tree.root.id
  },
})

// 選んでいる子の節の大きさの選び方を変えるダイアログを開く（根を選んでいるときと、その場の編集中は出さない。根はページの設定で変える）
export const NODE_SIZE_EDIT = kit.defineCommand({
  id: "node-size-edit",
  performs: [NODE_UPDATE.id],
  title: "Node size",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    if (!tree) return
    a.openDialog(ctx.stage.id, NODE_SIZE_DIALOG.id, {
      page: tree.page.id,
      node: selectedIn(tree.root, ctx.stage.selection),
    })
  },
  when: ctx => {
    const tree = editingTree(ctx) && !ctx.stage.editing ? treeAt(ctx) : null
    return tree !== null && selectedIn(tree.root, ctx.stage.selection) !== tree.root.id
  },
})

export const TREE_KEYS = [
  kit.defineKey({ id: "node-delete-delete", key: "Delete", command: NODE_DELETE.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-delete-backspace", key: "Backspace", command: NODE_DELETE.id, scope: TREE_KEYS_SCOPE }),
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
