// テストで使う、ビルトインプラグインだけの表と store
import { namingOf } from "../web/src/core/entries"
import { homeOver, worldTablesOf } from "../web/src/core/folders"
import type { Book } from "../web/src/core/schema/book"
import { NO_SETTINGS } from "../web/src/core/settings"
import { recentBookScreen, recentPlainScreen, stagesDefOf } from "../web/src/core/window"
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

// ブックスクリーンを開かない窓で始める、newStore の bookScreen の値
export const NO_BOOK_SCREEN = "none"

// 見本のブックを持ち、最初の 1 冊をブックスクリーン（c2 のステージ s1）に出した store（ブックが無ければ、何も開かないステージ s1）。
// bookScreen に NO_BOOK_SCREEN を渡すと、窓を開いたままの状態（ブックスクリーンは 0 枚）。id は n1, n2, … の順に振る
export function newStore(options: Omit<StoreOptions, "plugins"> & { bookScreen?: typeof NO_BOOK_SCREEN } = {}) {
  const { bookScreen, ...rest } = options
  const store = createMatomezuInstance({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
    ...rest,
  })
  if (bookScreen !== NO_BOOK_SCREEN) showFirstBook(store)
  return store
}

// 最初のブックを窓に出す（ブックが無ければ、何も開かないステージのブックスクリーンを開く）
export function showFirstBook(store: Pick<ReturnType<typeof createMatomezuInstance>, "state" | "actions" | "catalog">) {
  const first = Object.keys(store.state.getState().books)[0]
  if (first === undefined || !store.actions.showBook(first))
    store.actions.openScreen(stagesDefOf(store.catalog.core), {})
}

// store に最初のブックを窓に出させて、その store を返す（showFirstBook）
export function shown<S extends Parameters<typeof showFirstBook>[0]>(store: S): S {
  showFirstBook(store)
  return store
}

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
  const to = recentBookScreen(store.state.getState().window)
  if (to) store.actions.makeScreenCurrent(to.id)
}

// ブックの並び books を、ホストが知らせる形（置き場所から読んだままのページとフォルダの並び）にした物（instance.receive に渡す世界の pages と folders）。
// ブックは、書庫ホームの直下に置く
export function worldRows(books: readonly unknown[]): { pages: unknown[]; folders: unknown[] } {
  const tables = worldTablesOf(books as readonly Book[], [homeOver(books as readonly Book[])])
  return { pages: Object.values(tables.pages), folders: Object.values(tables.folders) }
}

// 利用者の設定の無いとき（英語）の、ビルトインプラグインの名前を引く決まり
export const NAMING = namingOf(CORE_CATALOG, NO_SETTINGS)
