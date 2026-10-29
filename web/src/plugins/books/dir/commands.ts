// ディレクトリ構成図のコマンド: フォルダを開け閉めする（▸・▾ が呼ぶ。鉛筆でもハンドでも。編集のロックなどでアクションが止められていれば押せない）と、鉛筆の間のコマンド。
// 鉛筆の間は、↑・↓ で選ぶ行を替え、Home で根を選び、Enter と F2 で選んでいる行の名前をその場で書き始める。
// d と f で、すぐ下に兄弟のフォルダとファイルを足し（根では根の中の末尾に）、その場で名前を書き始める。
// 行の右クリックのメニューで、フォルダとファイルを足し（フォルダの行は中の末尾に。閉じていれば開く。ファイルの行はすぐ下に）、名前を書き、設定のダイアログを開き、
// フォルダの直下を名前で並べ（昇順・降順）、消す（Delete・Backspace でも。根は消せない。消したら、すぐ上の行を選ぶ）。キーはディレクトリ構成図の見せ方の範囲
import { type CommandContext, pagedOf } from "../../../plugin-api"
import { refusalMessage } from "../../base"
import { ENTRY_ADD, ENTRY_REMOVE, ENTRY_UPDATE, FOLDER_CLOSE, FOLDER_SORT } from "./actions"
import { DIR_KEYS_SCOPE, ENTRY_SETTINGS_DIALOG } from "./dir"
import { type AddAt, addAfter, addInto, afterRemove, entryOf, type Order, rowFrom, selectedIn } from "./edit"
import { DirFolderSchema, type Kind } from "./entry"
import { kit } from "./kit"
import { PENCIL_TOOL } from "./tools"

// 開いているページと、その根（ディレクトリ構成図のページでなければ null）
export function dirAt(ctx: CommandContext) {
  const book = pagedOf(ctx.book)
  const page = book?.pages.find(p => p.id === ctx.stage.opened?.page)
  const root = DirFolderSchema.safeParse(page && "root" in page ? page.root : undefined)
  if (!book || !page || !root.success) return null
  return { book, page, root: root.data }
}

// フォルダ folder を開け閉めする（開いていれば閉じ、閉じていれば開く）。開くと紙に入らず断られたら、トーストで知らせる
export const FOLDER_TOGGLE = kit.defineCommand({
  id: "folder-toggle",
  performs: [FOLDER_CLOSE.id],
  permissionScope: "opened-page",
  title: "Open or close folder",
  run: (ctx, a, args: { folder: string }) => {
    const dir = dirAt(ctx)
    const opened = ctx.stage.opened
    const folder = dir && entryOf(dir.root, args.folder)
    if (!dir || !opened || folder?.kind !== "folder") return
    const closed = folder.closed !== true
    const done = a.perform(FOLDER_CLOSE.id, { page: dir.page.id, folder: folder.id, closed }, { book: opened.book })
    if (!done.ok)
      a.showToast({
        kind: "warn",
        message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")),
      })
  },
  when: ctx => dirAt(ctx) !== null,
})

// コマンドが受け取る操作
type CommandActions = Parameters<typeof FOLDER_TOGGLE.run>[1]

// 鉛筆の間で、その場の編集中でない（ディレクトリ構成図のページを開いている）
const penciling = (ctx: CommandContext) =>
  ctx.stage.tool === PENCIL_TOOL.id && !ctx.stage.editing && dirAt(ctx) !== null

// 断られたわけをトーストで知らせる（許可の段が止めたのでなければ、断られるのは紙に入らないとき）
const refused = (ctx: CommandContext, a: CommandActions, done: Parameters<typeof refusalMessage>[1]) =>
  a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")) })

// 足す所 at に、名前の空の kind を 1 つ足して選び、その場で名前を書き始める（閉じたフォルダの中なら先に開く。開けない・足せなければトーストで知らせる）
export function addEntry(ctx: CommandContext, a: CommandActions, at: AddAt, kind: Kind): void {
  const dir = dirAt(ctx)
  const opened = ctx.stage.opened
  if (!dir || !opened) return
  const on = { book: opened.book }
  if (at.open) {
    const open = a.perform(FOLDER_CLOSE.id, { page: dir.page.id, folder: at.open, closed: false }, on)
    if (!open.ok) {
      refused(ctx, a, open)
      return
    }
  }
  const done = a.perform(
    ENTRY_ADD.id,
    {
      page: dir.page.id,
      parent: at.parent,
      ...(at.index === undefined ? {} : { index: at.index }),
      entries: [{ kind, name: "" }],
    },
    on,
  )
  const added = done.ok ? done.result.entries[0]?.id : undefined
  if (!added) {
    refused(ctx, a, done.ok ? { reason: "refused" } : done)
    return
  }
  a.select(ctx.stage.id, [added])
  a.setEditing(ctx.stage.id, true)
}

// 選んでいる行
const selected = (ctx: CommandContext) => {
  const dir = dirAt(ctx)
  return dir ? { ...dir, id: selectedIn(dir.root, ctx.stage.selection) } : null
}

export const ENTRY_SELECT_MOVE = kit.defineCommand({
  id: "entry-select-move",
  title: "Move selection",
  run: (ctx, a, args: { to: "up" | "down" }) => {
    const s = selected(ctx)
    if (s) a.select(ctx.stage.id, [rowFrom(s.root, s.id, args.to)])
  },
  when: penciling,
})

export const ENTRY_SELECT_ROOT = kit.defineCommand({
  id: "entry-select-root",
  title: "Select root",
  run: (ctx, a) => {
    const dir = dirAt(ctx)
    if (dir) a.select(ctx.stage.id, [dir.root.id])
  },
  when: penciling,
})

// 選んでいる行（根も）の名前を、その場で書き始める
export const ENTRY_RENAME = kit.defineCommand({
  id: "entry-rename",
  performs: [ENTRY_UPDATE.id],
  permissionScope: "opened-page",
  title: "Rename",
  run: (ctx, a) => {
    const s = selected(ctx)
    if (!s) return
    a.select(ctx.stage.id, [s.id])
    a.setEditing(ctx.stage.id, true)
  },
  when: penciling,
})

// すぐ下に兄弟の kind を足すコマンド（根では根の中の末尾に）
function addAfterCommand<const Id extends string>(id: Id, title: "Add folder below" | "Add file below", kind: Kind) {
  return kit.defineCommand({
    id,
    performs: [ENTRY_ADD.id],
    permissionScope: "opened-page",
    title,
    run: (ctx, a) => {
      const s = selected(ctx)
      const at = s && addAfter(s.root, s.id)
      if (at) addEntry(ctx, a, at, kind)
    },
    when: penciling,
  })
}

export const FOLDER_ADD_BELOW = addAfterCommand("folder-add-below", "Add folder below", "folder")
export const FILE_ADD_BELOW = addAfterCommand("file-add-below", "Add file below", "file")

// 選んでいる行に kind を足すコマンド（フォルダの行は中の末尾に。閉じていれば開く。ファイルの行はすぐ下に。＋と同じ足し方）
function addIntoCommand<const Id extends string>(id: Id, title: "Add folder" | "Add file", kind: Kind) {
  return kit.defineCommand({
    id,
    performs: [ENTRY_ADD.id],
    permissionScope: "opened-page",
    title,
    run: (ctx, a) => {
      const s = selected(ctx)
      const at = s && addInto(s.root, s.id)
      if (at) addEntry(ctx, a, at, kind)
    },
    when: penciling,
  })
}

export const FOLDER_ADD = addIntoCommand("folder-add", "Add folder", "folder")
export const FILE_ADD = addIntoCommand("file-add", "Add file", "file")

// 選んでいる行（根も）の設定のダイアログ（名前と色）を開く
export const ENTRY_SETTINGS = kit.defineCommand({
  id: "entry-settings",
  performs: [ENTRY_UPDATE.id],
  permissionScope: "opened-page",
  title: "Settings…",
  run: (ctx, a) => {
    const s = selected(ctx)
    if (s) a.openDialog(ctx.stage.id, ENTRY_SETTINGS_DIALOG.id, { page: s.page.id, entry: s.id })
  },
  when: penciling,
})

// 選んでいるフォルダの直下を名前で並べるコマンド（フォルダを選んでいるときだけ出す）
function sortCommand<const Id extends string>(id: Id, title: "Sort ascending" | "Sort descending", order: Order) {
  return kit.defineCommand({
    id,
    performs: [FOLDER_SORT.id],
    permissionScope: "opened-page",
    title,
    run: (ctx, a) => {
      const s = selected(ctx)
      const opened = ctx.stage.opened
      if (s && opened) a.perform(FOLDER_SORT.id, { page: s.page.id, folder: s.id, order }, { book: opened.book })
    },
    when: ctx => {
      const s = penciling(ctx) ? selected(ctx) : null
      return s !== null && entryOf(s.root, s.id)?.kind === "folder"
    },
  })
}

export const FOLDER_SORT_ASC = sortCommand("folder-sort-asc", "Sort ascending", "asc")
export const FOLDER_SORT_DESC = sortCommand("folder-sort-desc", "Sort descending", "desc")

// 選んでいる行を中身ごと消し、すぐ上の行を選ぶ（根を選んでいるときは出さない）
export const ENTRY_DELETE = kit.defineCommand({
  id: "entry-delete",
  performs: [ENTRY_REMOVE.id],
  permissionScope: "opened-page",
  title: "Delete",
  run: (ctx, a) => {
    const s = selected(ctx)
    const opened = ctx.stage.opened
    const next = s && afterRemove(s.root, s.id)
    if (!s || !opened || !next) return
    if (a.perform(ENTRY_REMOVE.id, { page: s.page.id, entry: s.id }, { book: opened.book }).ok)
      a.select(ctx.stage.id, [next])
  },
  when: ctx => {
    const s = penciling(ctx) ? selected(ctx) : null
    return s !== null && s.id !== s.root.id
  },
})

export const DIR_KEYS = [
  kit.defineKey({
    id: "entry-select-up",
    key: "ArrowUp",
    command: ENTRY_SELECT_MOVE.id,
    args: { to: "up" },
    scope: DIR_KEYS_SCOPE,
  }),
  kit.defineKey({
    id: "entry-select-down",
    key: "ArrowDown",
    command: ENTRY_SELECT_MOVE.id,
    args: { to: "down" },
    scope: DIR_KEYS_SCOPE,
  }),
  kit.defineKey({ id: "entry-select-root-home", key: "Home", command: ENTRY_SELECT_ROOT.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "entry-rename-enter", key: "Enter", command: ENTRY_RENAME.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "entry-rename-f2", key: "F2", command: ENTRY_RENAME.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "folder-add-below-d", key: "D", command: FOLDER_ADD_BELOW.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "file-add-below-f", key: "F", command: FILE_ADD_BELOW.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "entry-delete-delete", key: "Delete", command: ENTRY_DELETE.id, scope: DIR_KEYS_SCOPE }),
  kit.defineKey({ id: "entry-delete-backspace", key: "Backspace", command: ENTRY_DELETE.id, scope: DIR_KEYS_SCOPE }),
]
