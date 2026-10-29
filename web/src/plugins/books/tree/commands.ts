// ツリーのコマンド: 上下左右のキーで、選んでいる節を動かす（伸びる向きのキーで最初の子へ、逆向きで親へ、横向きで隣の兄弟へ）と、
// Home で根を選び、F2 で、選んでいる節のキャプションをその場で書き始める。Tab で子を、Enter ですぐ後ろの兄弟を足して、その場で書き始める（根に兄弟は足せない）。Delete（Backspace）と節の右クリックのメニューで、選んでいる節を子孫ごと消す（根は消せない。
// 消したら、前の兄弟、無ければ親を選ぶ）。節の右クリックのメニューで、節の色と、子の節の大きさのダイアログを開く。編集の道具の間だけ。キーはツリーの見せ方の範囲（ステージの範囲より先に探す）
import { type CommandContext, pagedOf } from "../../../plugin-api"
import { refusalMessage, settingValue } from "../../base"
import { NODE_ADD, NODE_REMOVE, NODE_UPDATE } from "./actions"
import { type Arrow, addArgs, afterRemove, keyPlus, moveFrom, selectedIn } from "./edit"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { EDIT_TOOL } from "./tools"
import { NODE_COLOR_DIALOG, NODE_SIZE_DIALOG, TREE_KEYS_SCOPE, TREE_PAGE_SETTINGS_DIALOG } from "./tree"

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

// 根を選ぶ
export const NODE_SELECT_ROOT = kit.defineCommand({
  id: "node-select-root",
  title: "Select root",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    if (tree) a.select(ctx.stage.id, [tree.root.id])
  },
  when: editingTree,
})

// 選んでいる節（何も選んでいなければ根）を編集し始める。子はその場で、根はページの設定のダイアログ（根のダイアログを兼ねる）で
export const NODE_EDIT = kit.defineCommand({
  id: "node-edit",
  title: "Edit caption",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    if (!tree) return
    const node = selectedIn(tree.root, ctx.stage.selection)
    if (node === tree.root.id) return a.openDialog(ctx.stage.id, TREE_PAGE_SETTINGS_DIALOG.id, { page: tree.page.id })
    a.select(ctx.stage.id, [node])
    a.setEditing(ctx.stage.id, true)
  },
  when: editingTree,
})

// 選んでいる節に、空の子（kind child）か、すぐ後ろの兄弟（kind after）を足して選び、その場で書き始めるコマンド。紙に入らず断られたら、トーストで知らせる
function addCommand<const Id extends string>(
  id: Id,
  title: "Add child" | "Add sibling after",
  kind: "child" | "after",
  when: (ctx: CommandContext) => boolean,
) {
  return kit.defineCommand({
    id,
    performs: [NODE_ADD.id],
    title,
    run: (ctx, a) => {
      const tree = treeAt(ctx)
      const opened = ctx.stage.opened
      if (!tree || !opened) return
      const plus = keyPlus(tree.root, tree.grow, selectedIn(tree.root, ctx.stage.selection), kind)
      if (!plus) return
      const done = a.perform(NODE_ADD.id, addArgs(tree.page.id, plus), { book: opened.book })
      const added = done.ok ? done.result.nodes[0]?.id : undefined
      if (!added) {
        const why = refusalMessage(
          ctx.catalog,
          done.ok ? { reason: "refused" } : done,
          kit.message("Does not fit on the paper"),
        )
        a.showToast({ kind: "warn", message: why })
        return
      }
      a.select(ctx.stage.id, [added])
      a.setEditing(ctx.stage.id, true)
    },
    when,
  })
}

export const NODE_ADD_CHILD = addCommand(
  "node-add-child",
  "Add child",
  "child",
  ctx => editingTree(ctx) && !ctx.stage.editing && treeAt(ctx) !== null,
)

// 根を選んでいるときは出さない
export const NODE_ADD_SIBLING = addCommand("node-add-sibling", "Add sibling after", "after", ctx => {
  const tree = editingTree(ctx) && !ctx.stage.editing ? treeAt(ctx) : null
  return tree !== null && selectedIn(tree.root, ctx.stage.selection) !== tree.root.id
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

// 選んでいる節（根も）の色を変えるダイアログを開く（その場の編集中は出さない）
export const NODE_COLOR_EDIT = kit.defineCommand({
  id: "node-color-edit",
  performs: [NODE_UPDATE.id, "@matomezu/base:page-update"],
  title: "Node color",
  run: (ctx, a) => {
    const tree = treeAt(ctx)
    if (!tree) return
    a.openDialog(ctx.stage.id, NODE_COLOR_DIALOG.id, {
      page: tree.page.id,
      node: selectedIn(tree.root, ctx.stage.selection),
    })
  },
  when: ctx => editingTree(ctx) && !ctx.stage.editing && treeAt(ctx) !== null,
})

export const TREE_KEYS = [
  kit.defineKey({ id: "node-select-root-home", key: "Home", command: NODE_SELECT_ROOT.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-delete-delete", key: "Delete", command: NODE_DELETE.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-delete-backspace", key: "Backspace", command: NODE_DELETE.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-edit-f2", key: "F2", command: NODE_EDIT.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-add-child-tab", key: "Tab", command: NODE_ADD_CHILD.id, scope: TREE_KEYS_SCOPE }),
  kit.defineKey({ id: "node-add-sibling-enter", key: "Enter", command: NODE_ADD_SIBLING.id, scope: TREE_KEYS_SCOPE }),
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
