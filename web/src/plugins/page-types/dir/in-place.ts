// ディレクトリ構成図のその場の編集（名前と説明）の、書いている字と、確定・取り消し: 書いている字はステージごとのプラグイン状態（名前は DIR_DRAFT、説明は DIR_NOTE_DRAFT）に置き（ビューの入力Formが書く）、
// 入力Formが名乗るキーの範囲 DIR_EDIT_KEY_SCOPE の Enter で確定し、Escape で取り消す（焦点が外れたときは base の useInPlaceInput の onBlur が確定のコマンドを行う）。
// 名前を書き終えたとき、することは edit.ts の editEnd（空なら消す・名前を変える）、説明は noteEnd が決める。書き換えが紙に入らず断られたら、トーストで知らせる
import type { CommandContext } from "../../../plugin-api"
import { endInPlace, type InPlaceDraft, inPlaceText } from "../../base"
import { ENTRY_REMOVE, ENTRY_UPDATE } from "./actions"
import { ADDED_EDIT, dirAt, fitRefusal } from "./commands"
import { afterRemove, editEnd, noteEnd, selectedIn } from "./edit"
import { kit } from "./kit"
import { PENCIL_TOOL } from "./tools"

// 書いている名前（どの中身のものか）
export const DIR_DRAFT = kit.definePluginStateOf<InPlaceDraft>()({ id: "in-place-draft", scope: "stage" })

// 書いている説明（どの中身のものか）
export const DIR_NOTE_DRAFT = kit.definePluginStateOf<InPlaceDraft>()({ id: "in-place-note-draft", scope: "stage" })

// 名前と説明の入力Formが名乗るキーの範囲
export const DIR_EDIT_KEY_SCOPE = kit.defineKeyScope({
  id: "in-place",
  title: "Directory editing in place",
  commandsFrom: "stage",
})

// 説明を書いている間のその場の編集の名前（名前を書いている間は true か ADDED_EDIT）
export const NOTE_EDIT = kit.name("note-edit")

// 鉛筆で、名前か説明を書いている間か（背景編集モードの間の文字枠の書き換え（slide のもの。stage.editing は同じ true）は除く）
export const writingName = (ctx: Pick<CommandContext, "stage">) =>
  ctx.stage.tool === PENCIL_TOOL.id &&
  ctx.stage.edits === "items" &&
  (ctx.stage.editing === true || ctx.stage.editing === ADDED_EDIT)
export const writingNote = (ctx: Pick<CommandContext, "stage">) =>
  ctx.stage.tool === PENCIL_TOOL.id && ctx.stage.editing === NOTE_EDIT

type Actions = Parameters<typeof DIR_EDIT_COMMIT.run>[1]

// 書いている名前か説明を、commit なら確定し、そうでなければ取り消して、その場の編集をやめる
function endEdit(ctx: CommandContext, a: Actions, commit: boolean): void {
  const dir = dirAt(ctx)
  if (!dir) return
  const selected = selectedIn(dir.root, ctx.stage.selection)
  const on = { page: dir.page.id }
  if (writingNote(ctx)) {
    const text = commit ? inPlaceText(ctx, DIR_NOTE_DRAFT, selected) : null
    endInPlace(ctx, a, DIR_NOTE_DRAFT, false, () => {
      const next = commit ? noteEnd(dir.root, selected, text) : undefined
      if (next === undefined) return
      const done = a.perform(ENTRY_UPDATE.id, { entry: selected, description: next }, on)
      if (!done.ok) a.showToast(fitRefusal(ctx.catalog, done))
    })
    return
  }
  const text = commit ? inPlaceText(ctx, DIR_DRAFT, selected) : null
  endInPlace(ctx, a, DIR_DRAFT, ctx.stage.editing === ADDED_EDIT, () => {
    const todo = editEnd(dir.root, selected, text)
    if (todo.kind === "remove") {
      const next = afterRemove(dir.root, selected)
      if (a.perform(ENTRY_REMOVE.id, { entry: selected }, on).ok && next) a.select([next])
    }
    if (todo.kind === "rename") {
      const done = a.perform(ENTRY_UPDATE.id, { entry: selected, name: todo.name }, on)
      if (!done.ok) a.showToast(fitRefusal(ctx.catalog, done)) // 書けない字は書かず、元の名前のまま
    }
  })
}

const editing = (ctx: CommandContext) => (writingName(ctx) || writingNote(ctx)) && dirAt(ctx) !== null

// 書いている名前か説明を確定する
export const DIR_EDIT_COMMIT = kit.defineCommand({
  id: "entry-edit-commit",
  performs: [ENTRY_UPDATE.id, ENTRY_REMOVE.id],
  permissionScope: "opened-page",
  title: "OK",
  run: (ctx, a) => endEdit(ctx, a, true),
  when: editing,
})

// 書いている名前か説明を取り消す（足したばかりの名前の空の中身は消す。消すのを認可ステップが止めていても押せ、そのときは消さずに字を捨てて終える）
export const DIR_EDIT_CANCEL = kit.defineCommand({
  id: "entry-edit-cancel",
  performs: [ENTRY_REMOVE.id],
  permissionScope: "opened-page",
  denied: "runs",
  title: "Cancel",
  run: (ctx, a) => endEdit(ctx, a, false),
  when: editing,
})

export const DIR_EDIT_KEYS = [
  kit.defineKey({
    id: "entry-edit-commit-enter",
    key: "Enter",
    command: DIR_EDIT_COMMIT.id,
    scope: DIR_EDIT_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "entry-edit-cancel-escape",
    key: "Escape",
    command: DIR_EDIT_CANCEL.id,
    scope: DIR_EDIT_KEY_SCOPE.id,
  }),
]
