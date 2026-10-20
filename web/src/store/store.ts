// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore, type StoreApi } from "zustand/vanilla"
import { hasPages, singleBooks } from "../core/book"
import type { ActionContext } from "../core/def/action"
import { fail } from "../core/errors"
import type { Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { type ArgsOf, perform } from "../core/perform"
import type { Registry } from "../core/registry"
import type { Book } from "../core/schema/book"
import { openBook, panBy, resize } from "../core/stage"
import type { SingleBookTypeId } from "../core/tables"
import { close, focus, mapStage, newWorkspace, showPage, split, unsplit, type Workspace } from "../core/workspace"
import { type CommandArgs, type CommandId, commandContext, commandDef, isEnabled } from "./commands"
import type { OpenedDialog } from "./dialogs"
import { type AppDefs, assemble, type Plugin } from "./plugin"
import type { DialogId } from "./tables"

// 見る人ごとの設定
export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
}

export interface AppState {
  books: Record<string, Book> // ブックの id ごと
  workspace: Workspace
  settings: Settings
  dialog: OpenedDialog | null
}

export interface Actions {
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  openDialog(stage: string, id: DialogId): void // そのステージから開くダイアログを出す（出ていたものは閉じる）
  closeDialog(): void
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（図面は最初のページ）、カレントにする
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにする
  // そのステージのブックにページを足して（アクション page.add）、そのステージで開き、カレントにする。足せたか返す
  addPage(stage: string, args: ArgsOf<"page.add">): boolean
  // ブックを作って（アクション book.create）、そのステージで開き、カレントにする。作れたか返す
  createBook(stage: string, args: ArgsOf<"book.create">): boolean
  setLang(lang: Lang): void
  setSkin(skin: string): void
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  panStageBy(id: string, dx: number, dy: number): void
}

export type ReadonlyStore = Pick<StoreApi<AppState>, "getState" | "getInitialState" | "subscribe">

// AppDefs は、この store が使う定義の表（登録表・コマンド・ダイアログ・ホーム）。plugins は、表のもとにしたプラグイン（画面の側が見た目を引く）
export interface AppStore<Ps extends readonly Plugin[] = readonly Plugin[]> extends AppDefs {
  plugins: Ps
  state: ReadonlyStore
  actions: Actions
}

// 最初のブック（無ければホーム、それも無ければ何も開かない）を開いた状態。表にある 1 冊だけのタイプのブックはいつも持つ
function initialState(registry: Registry, books: readonly Book[], lang: Lang, home: string | null): AppState {
  const all = [...singleBooks(registry), ...books]
  const first = books[0] ?? all.find(b => b.id === home) ?? null
  return {
    books: Object.fromEntries(all.map(b => [b.id, b])),
    workspace: newWorkspace(registry, first),
    settings: { lang, skin: "auto" },
    dialog: null,
  }
}

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  home?: SingleBookTypeId // ホームのブック（1 冊だけのタイプ）。最初に開くブックと「ホームを開く」の行き先で、ブックの一覧のアクションを許すかはこのタイプが決める
  books?: readonly Book[] // 最初に持つブック（最初の 1 冊を開く）。無ければ持たず、ホームを開く
  lang?: Lang // 無ければ日本語
  initial?: AppState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // 作るブックの id を振る。無ければ、どの世界でも重ならない uuid
}

export function createAppStore<const Ps extends readonly Plugin[]>(options: StoreOptions<Ps>): AppStore<Ps> {
  const { plugins } = options
  const defs = assemble(plugins, options.home ?? null)
  const { registry, home } = defs
  const initial = options.initial ?? initialState(registry, options.books ?? [], options.lang ?? "ja", home)
  const newId = options.newId ?? (() => crypto.randomUUID())
  const store = createStore<AppState>()(() => initial)
  const { getState, setState } = store
  const ctx = (): ActionContext => ({ registry, home, lang: getState().settings.lang, newId })
  // 開いたステージが無くなったダイアログは閉じる
  const withWorkspace = (change: (ws: Workspace) => Workspace) => {
    const { workspace: ws, dialog } = getState()
    const next = change(ws)
    if (next === ws) return
    const keeps = dialog === null || next.stages.some(s => s.id === dialog.stage)
    setState(keeps ? { workspace: next } : { workspace: next, dialog: null })
  }
  const actions: Actions = {
    command: (stage, id, ...args) => {
      const state = getState()
      const def = commandDef(defs, id)
      const ctx = commandContext(registry, home, state, stage)
      if (!ctx || !isEnabled(defs, state, stage, id)) return false
      def.run(ctx, actions, args[0] as never)
      return true
    },
    openDialog: (stage, id) => {
      if (!defs.dialogs.has(id)) fail("E108", { id })
      if (getState().workspace.stages.some(s => s.id === stage)) setState({ dialog: { id, stage } })
    },
    closeDialog: () => {
      if (getState().dialog) setState({ dialog: null })
    },
    split: stage => withWorkspace(ws => split(focus(ws, stage))),
    unsplit: stage => withWorkspace(ws => unsplit(focus(ws, stage))),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      if (book) withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(registry, s, book)))
    },
    openPage: (stage, page) => {
      const { books, workspace } = getState()
      const book = books[workspace.stages.find(s => s.id === stage)?.opened?.book ?? ""]
      if (book && hasPages(book)) withWorkspace(ws => showPage(registry, focus(ws, stage), stage, book, page))
    },
    addPage: (stageId, args) => {
      const { books, workspace } = getState()
      const owner = books[workspace.stages.find(s => s.id === stageId)?.opened?.book ?? ""]
      if (!owner) return false
      const done = perform(owner, "page.add", args, ctx())
      if (!done.ok || !hasPages(done.next)) return false
      setState({
        books: { ...books, [done.next.id]: done.next },
        workspace: showPage(registry, focus(workspace, stageId), stageId, done.next, done.result.page),
      })
      return true
    },
    createBook: (stageId, args) => {
      const { books, workspace } = getState()
      const done = perform(books, "book.create", args, ctx())
      const book = done.ok && done.next[done.result.book]
      if (!book) return false
      setState({
        books: done.next,
        workspace: mapStage(focus(workspace, stageId), stageId, s => openBook(registry, s, book)),
      })
      return true
    },
    setLang: lang => {
      if (getState().settings.lang !== lang) setState({ settings: { ...getState().settings, lang } })
    },
    setSkin: skin => {
      if (getState().settings.skin !== skin) setState({ settings: { ...getState().settings, skin } })
    },
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
  }
  return { ...defs, plugins, state: store, actions }
}
