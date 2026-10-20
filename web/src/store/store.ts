// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる
import { createStore, type StoreApi } from "zustand/vanilla"
import { hasPages, MASTER_BOOK } from "../core/book"
import type { Size } from "../core/geom"
import type { Lang } from "../core/i18n/i18n"
import { perform } from "../core/perform"
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
  split(): void
  unsplit(): void
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（図面は最初のページ）、カレントにする
  openMaster(): void // カレントのステージでマスターのブックを開く
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにする
  addPage(stage: string): void // そのステージのブックに足して（アクション page.add）、そのステージで開き、カレントにする
  setLang(lang: Lang): void
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
  if (!first?.pages[0]) throw new Error("no book to open")
  return {
    books: Object.fromEntries([MASTER_BOOK, ...books].map(b => [b.id, b])),
    workspace: newWorkspace(first.id, first.pages[0].id),
    settings: { lang, skin: "auto" },
  }
}

export function createAppStore(initial: AppState = initialState()): AppStore {
  const store = createStore<AppState>()(() => initial)
  const { getState, setState } = store
  const withWorkspace = (change: (ws: Workspace) => Workspace) => {
    const ws = getState().workspace
    const next = change(ws)
    if (next !== ws) setState({ workspace: next })
  }
  const actions: Actions = {
    split: () => withWorkspace(split),
    unsplit: () => withWorkspace(unsplit),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      if (book) withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(s, book)))
    },
    openMaster: () => withWorkspace(ws => mapStage(ws, ws.current, s => openBook(s, MASTER_BOOK))),
    openPage: (stage, page) => withWorkspace(ws => showPage(focus(ws, stage), stage, page)),
    addPage: stageId => {
      const { books, workspace, settings } = getState()
      const stage = workspace.stages.find(s => s.id === stageId)
      const owner = stage?.opened && books[stage.opened.book]
      if (!owner) return
      const done = perform(owner, "page.add", {}, { lang: settings.lang })
      if (!done.ok || done.book === owner || !hasPages(done.book)) return
      const page = done.book.pages.at(-1)
      if (!page) return
      setState({
        books: { ...books, [done.book.id]: done.book },
        workspace: showPage(focus(workspace, stageId), stageId, page.id),
      })
    },
    setLang: lang => {
      if (getState().settings.lang !== lang) setState({ settings: { ...getState().settings, lang } })
    },
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
  }
  return { state: store, actions }
}
