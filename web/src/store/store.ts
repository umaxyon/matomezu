// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる
import { createStore, type StoreApi } from "zustand/vanilla"
import { addPage } from "../core/book"
import type { Size } from "../core/geom"
import type { Book } from "../core/schema/book"
import { panBy, resize } from "../core/stage"
import { focus, mapStage, newWorkspace, showPage, split, unsplit, type Workspace } from "../core/workspace"

export interface AppState {
  books: Record<string, Book> // ブックの id ごと
  workspace: Workspace
}

export interface Actions {
  split(): void
  unsplit(): void
  focusStage(id: string): void
  openPage(stage: string, page: string): void // そのステージで開き、カレントにする
  addPage(stage: string): void // そのステージのブックに足して、そのステージで開き、カレントにする
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  panStageBy(id: string, dx: number, dy: number): void
}

export type ReadonlyStore = Pick<StoreApi<AppState>, "getState" | "getInitialState" | "subscribe">

export interface AppStore {
  state: ReadonlyStore
  actions: Actions
}

export function initialState(): AppState {
  const book: Book = { id: "b1", title: "ブック 1", pages: [{ id: "p1", title: "ページ 1" }] }
  return { books: { [book.id]: book }, workspace: newWorkspace(book.id, "p1") }
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
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openPage: (stage, page) => withWorkspace(ws => showPage(focus(ws, stage), stage, page)),
    addPage: stageId => {
      const { books, workspace } = getState()
      const stage = workspace.stages.find(s => s.id === stageId)
      const owner = stage && books[stage.book]
      if (!owner) return
      const { book, page } = addPage(owner)
      setState({
        books: { ...books, [book.id]: book },
        workspace: showPage(focus(workspace, stageId), stageId, page.id),
      })
    },
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
  }
  return { state: store, actions }
}
