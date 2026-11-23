// ツリーのその場の編集（節のキャプション）の、書いている字と、確定・取り消し: 書いている字はステージごとのプラグイン状態 TREE_DRAFT に置き（ビューの入力Formが書く）、
// 入力Formが名乗るキーの範囲 TREE_EDIT_KEY_SCOPE の Enter で確定し、Escape で取り消す（焦点が外れたときは base の useInPlaceInput の onBlur が確定のコマンドを行う）。
// 書き終えたとき、することは edit.ts の editEnd（空の子なら消す・書く）が決め、書き分け（根はページのフィールド、子は node-update）は write.ts の nodeWrite。
// 書き換えが紙に入らず断られたら、トーストで知らせる
import type { CommandContext } from "../../../plugin-api"
import { endInPlace, type InPlaceDraft, inPlaceText, NO_DRAFT, refusalMessage } from "../../base"
import { NODE_REMOVE, NODE_UPDATE } from "./actions"
import { treeAt } from "./commands"
import { ADDED_EDIT, afterRemove, CAPTION_EDIT, editEnd, selectedIn } from "./edit"
import { kit } from "./kit"
import { EDIT_TOOL } from "./tools"
import { nodeWrite, PAGE_UPDATE } from "./write"

// 書いているキャプション（どの節のものか）
export const TREE_DRAFT = kit.definePluginStateOf<InPlaceDraft>()({ id: "in-place-draft", scope: "stage" })

// キャプションの入力Formが名乗るキーの範囲
export const TREE_EDIT_KEY_SCOPE = kit.defineKeyScope({
  id: "in-place",
  title: "Tree editing in place",
  commandsFrom: "stage",
})

// 編集の道具で、キャプションを書いている間か
export const writingCaption = (ctx: Pick<CommandContext, "stage">) =>
  ctx.stage.tool === EDIT_TOOL.id && (ctx.stage.editing === CAPTION_EDIT || ctx.stage.editing === ADDED_EDIT)

type Actions = Parameters<typeof TREE_EDIT_COMMIT.run>[1]

// 書いているキャプションを、commit なら確定し、そうでなければ取り消して、その場の編集をやめる
function endEdit(ctx: CommandContext, a: Actions, commit: boolean): void {
  const tree = treeAt(ctx)
  const selected = tree && selectedIn(tree.root, ctx.stage.selection)
  if (!tree || !selected) return
  const on = { page: tree.page.id }
  const draft = commit ? inPlaceText(ctx, TREE_DRAFT, selected) : NO_DRAFT
  const text = draft === NO_DRAFT ? null : draft
  endInPlace(ctx, a, TREE_DRAFT, ctx.stage.editing === ADDED_EDIT, () => {
    const todo = editEnd(tree.root, selected, text)
    if (todo.kind === "remove") {
      const next = afterRemove(tree.root, tree.grow, selected)
      if (a.perform(NODE_REMOVE.id, { node: selected }, on).ok && next) a.select([next])
      return
    }
    if (todo.kind === "none") return
    const w = nodeWrite(todo.kind === "root", selected, { caption: todo.caption })
    const done = a.perform(w.action, w.args, on)
    // 書けない字は書かず、元のキャプションのまま
    if (!done.ok)
      a.showToast({
        kind: "warn",
        message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")),
      })
  })
}

const editing = (ctx: CommandContext) => writingCaption(ctx) && treeAt(ctx) !== null

// 書いているキャプションを確定する
export const TREE_EDIT_COMMIT = kit.defineCommand({
  id: "node-edit-commit",
  performs: [NODE_UPDATE.id, NODE_REMOVE.id, PAGE_UPDATE],
  permissionScope: "opened-page",
  title: "OK",
  run: (ctx, a) => endEdit(ctx, a, true),
  when: editing,
})

// 書いているキャプションを取り消す（足したばかりの空の節は消す。消すのを認可ステップが止めていても押せ、そのときは消さずに字を捨てて終える）
export const TREE_EDIT_CANCEL = kit.defineCommand({
  id: "node-edit-cancel",
  performs: [NODE_REMOVE.id],
  permissionScope: "opened-page",
  denied: "runs",
  title: "Cancel",
  run: (ctx, a) => endEdit(ctx, a, false),
  when: editing,
})

export const TREE_EDIT_KEYS = [
  kit.defineKey({
    id: "node-edit-commit-enter",
    key: "Enter",
    command: TREE_EDIT_COMMIT.id,
    scope: TREE_EDIT_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "node-edit-cancel-escape",
    key: "Escape",
    command: TREE_EDIT_CANCEL.id,
    scope: TREE_EDIT_KEY_SCOPE.id,
  }),
]
