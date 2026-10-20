// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる
import { createStore, type StoreApi } from "zustand/vanilla"
import { hasPages, MASTER_BOOK } from "../core/book"
import type { ActionContext } from "../core/def/action"
import type { Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { type ArgsOf, perform } from "../core/perform"
import type { Book, BookOf } from "../core/schema/book"
import { openBook, panBy, resize } from "../core/stage"
import { close, focus, mapStage, newWorkspace, showPage, split, unsplit, type Workspace } from "../core/workspace"
import { SAMPLE_BOOKS } from "./sample-books"

// 見る人ごとの設定
export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
}

export interface AppState {
  books: Record<string, Book> // ブックの id ごと
  workspace: Workspace
  settings: Settings
}

export interface Actions {
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（図面は最初のページ）、カレントにする
  openMaster(stage: string): void // そのステージでマスターのブックを開き、カレントにする
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

export interface AppStore {
  state: ReadonlyStore
  actions: Actions
}

// 最初のブックを開いた状態。マスターのブックはいつもある
export function initialState(books: readonly BookOf<"drawing">[] = SAMPLE_BOOKS, lang: Lang = "ja"): AppState {
  const first = books[0]
  if (!first) throw new Error("no book to open")
  return {
    books: Object.fromEntries([MASTER_BOOK, ...books].map(b => [b.id, b])),
    workspace: newWorkspace(first),
    settings: { lang, skin: "auto" },
  }
}

// newId は、作るブックの id を振る（どの世界でも重ならない uuid）
export function createAppStore(
  initial: AppState = initialState(),
  newId: () => string = () => crypto.randomUUID(),
): AppStore {
  const store = createStore<AppState>()(() => initial)
  const { getState, setState } = store
  const ctx = (): ActionContext => ({ lang: getState().settings.lang, newId })
  const withWorkspace = (change: (ws: Workspace) => Workspace) => {
    const ws = getState().workspace
    const next = change(ws)
    if (next !== ws) setState({ workspace: next })
  }
  const actions: Actions = {
    split: stage => withWorkspace(ws => split(focus(ws, stage))),
    unsplit: stage => withWorkspace(ws => unsplit(focus(ws, stage))),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      if (book) withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(s, book)))
    },
    openMaster: stage => withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(s, MASTER_BOOK))),
    openPage: (stage, page) => {
      const { books, workspace } = getState()
      const book = books[workspace.stages.find(s => s.id === stage)?.opened?.book ?? ""]
      if (book && hasPages(book)) withWorkspace(ws => showPage(focus(ws, stage), stage, book, page))
    },
    addPage: (stageId, args) => {
      const { books, workspace } = getState()
      const owner = books[workspace.stages.find(s => s.id === stageId)?.opened?.book ?? ""]
      if (!owner) return false
      const done = perform(owner, "page.add", args, ctx())
      if (!done.ok || !hasPages(done.next)) return false
      setState({
        books: { ...books, [done.next.id]: done.next },
        workspace: showPage(focus(workspace, stageId), stageId, done.next, done.result.page),
      })
      return true
    },
    createBook: (stageId, args) => {
      const { books, workspace } = getState()
      const done = perform(books, "book.create", args, ctx())
      const book = done.ok && done.next[done.result.book]
      if (!book) return false
      setState({ books: done.next, workspace: mapStage(focus(workspace, stageId), stageId, s => openBook(s, book)) })
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
  return { state: store, actions }
}
