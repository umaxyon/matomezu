// テストで使う、ビルトインプラグインだけの表と store
import { homeOver, worldTablesOf } from "../web/src/core/folders"
import type { Book } from "../web/src/core/schema/book"
import { recentBookScreen, recentPlainScreen } from "../web/src/core/window"
import { BUILTIN } from "../web/src/plugins"
import { assemble } from "../web/src/store/plugin"
import { createMatomezuInstance, type StoreOptions } from "../web/src/store/store"
import { SAMPLE_BOOKS } from "./sample-books"

export const CORE_CATALOG = assemble(BUILTIN).catalog.core
export const BUILTIN_PARTS = CORE_CATALOG.parts

// 順に n1, n2, … を返す newId（振った id を読みやすく、決まった値にする）
export function sequence(prefix = "n"): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

// 見本のブックを持ち、最初の 1 冊を開いた store。id は n1, n2, … の順に振る
export const newStore = (options: Omit<StoreOptions, "plugins"> = {}) =>
  createMatomezuInstance({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
    ...options,
  })

// 画面の大きさを決めた store（ステージ s1 が 1400×1000。紙に形を置くテストの準備）
export function sizedStore(options: Omit<StoreOptions, "plugins"> = {}) {
  const store = newStore(options)
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}

// ステージを並べないスクリーン（コントロールセンター）を、カレントスクリーンにする
export function showCenter(store: Pick<ReturnType<typeof newStore>, "state" | "actions">) {
  const to = recentPlainScreen(store.state.getState().window)
  if (to) store.actions.makeScreenCurrent(to.id)
}

// ブックスクリーンを、カレントスクリーンにする
export function showBooks(store: Pick<ReturnType<typeof newStore>, "state" | "actions">) {
  store.actions.makeScreenCurrent(recentBookScreen(store.state.getState().window).id)
}

// ブックの並び books を、ホストが知らせる形（置き場所から読んだままのページとフォルダの並び）にした物（instance.receive に渡す世界の pages と folders）。
// ブックは、書庫ホームの直下に置く
export function worldRows(books: readonly unknown[]): { pages: unknown[]; folders: unknown[] } {
  const tables = worldTablesOf(books as readonly Book[], [homeOver(books as readonly Book[])])
  return { pages: Object.values(tables.pages), folders: Object.values(tables.folders) }
}
