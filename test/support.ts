// テストで使う、ビルトインプラグインだけの表と store
import { namingOf } from "../web/src/core/entries"
import {
  type AnyEntryRef,
  type BinderFolder,
  HOME_ID,
  type HomeOrFolder,
  type Library,
  type PageRow,
} from "../web/src/core/folders"
import { tablesOf } from "../web/src/core/folders-books"
import type { AnyPage, BinderEntry, Book } from "../web/src/core/schema/book"
import { NO_SETTINGS } from "../web/src/core/settings"
import { NO_PAGE, NO_PAPER, NO_PLACING, openedPage, type Placing, paperOf, placement } from "../web/src/core/stage"
import { recentBookScreen, recentPlainScreen, stagesDefOf } from "../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../web/src/plugins"
import { assemble } from "../web/src/store/plugin"
import type { StoreOptions } from "../web/src/store/state"
import { createMatomezuInstance } from "../web/src/store/store"
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
    controlCenter: BUILTIN_CONTROL_CENTER,
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

// ブック books と、ブックの外のページ・バインダ outside を書庫ホームの直下に置いた書庫（ホームの並びは、ブックのあとに外の物）。
// 外の物は、テストの用意として表に直に置く（作るアクションは通さない）。バインダは、バインダの行（設定の項目の値も）と中のページの行に分ける
export function libraryWith(books: readonly Book[], outside: readonly (AnyPage | BinderEntry)[] = []): Library {
  const tables = tablesOf(books)
  const lineup: AnyEntryRef[] = [
    ...books.map(b => ({ kind: "book" as const, id: b.id })),
    ...outside.map(e => ({ kind: e.kind, id: e.id })),
  ]
  const pages = outside.flatMap((e): readonly PageRow[] => (e.kind === "binder" ? e.lineup : [e]))
  const binders = outside.flatMap((e): readonly BinderFolder[] =>
    e.kind === "binder"
      ? [
          {
            folderRole: "binder",
            id: e.id,
            title: e.title,
            pageType: e.pageType,
            lineup: e.lineup.map(p => ({ kind: "page", id: p.id })),
            ...(e.settings ? { settings: e.settings } : {}),
          },
        ]
      : [],
  )
  return {
    pages: { ...tables.pages, ...Object.fromEntries(pages.map(p => [p.id, p])) },
    folders: {
      ...tables.folders,
      ...Object.fromEntries(binders.map(f => [f.id, f])),
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup },
    },
  }
}

// 書庫 libraryWith(books, outside) を、ホストが知らせる形（置き場所から読んだままのページとフォルダの並び）にした物（instance.receive と常駐のエンジンに渡す世界の pages と folders）
export function worldRows(
  books: readonly unknown[],
  outside: readonly (AnyPage | BinderEntry)[] = [],
): { pages: unknown[]; folders: unknown[] } {
  const tables = libraryWith(books as readonly Book[], outside)
  return { pages: Object.values(tables.pages), folders: Object.values(tables.folders) }
}

// 利用者の設定の無いとき（英語）の、ビルトインプラグインの名前を引く決まり
export const NAMING = namingOf(CORE_CATALOG, NO_SETTINGS)

// 常駐が書庫を整えた（core/unreadable.ts の settleLibrary。足りないシステムフォルダを足し、名前の重なりに番号を付ける）あとの世界を、store に届ける（matomezu/testing と同じ物）
export { settleIn } from "../web/src/store/settle"

// 残したブック books（形を確かめる前の値。壊れた物も）を、ホストが置き場所に持つ形の行にした物（createMatomezu の saved に渡す）。
// 並びのページとバインダは、id だけの並びの要素と、ページの行・バインダの行に分ける。並びを持たない物は、フォルダの行としてそのまま残す。書庫ホームの行は作らない（store が足す）
export function savedRows(books: readonly unknown[]): { pages: unknown[]; folders: unknown[] } {
  const pages: unknown[] = []
  const folders: unknown[] = []
  const isEntry = (e: unknown): e is { kind: unknown; id: string; lineup?: unknown } =>
    typeof e === "object" && e !== null && typeof (e as { id?: unknown }).id === "string"
  for (const b of books) {
    const lineup = (b as { lineup?: unknown } | null)?.lineup
    if (!Array.isArray(lineup)) {
      folders.push(b)
      continue
    }
    const refs = lineup.map(e => {
      if (!isEntry(e)) return e
      if (e.kind === "binder" && Array.isArray(e.lineup)) {
        const { kind: _, lineup: inner, ...fields } = e
        pages.push(...(inner as unknown[]))
        folders.push({
          ...fields,
          folderRole: "binder",
          lineup: (inner as unknown[]).map(p => (isEntry(p) ? { kind: "page", id: p.id } : p)),
        })
        return { kind: "binder", id: e.id }
      }
      if (e.kind === "page") {
        pages.push(e)
        return { kind: "page", id: e.id }
      }
      return e
    })
    folders.push({ ...(b as object), lineup: refs })
  }
  return { pages, folders }
}

// 世界の表: ブック books を分けた表に、書庫ホームとフォルダ others を足した物（テストの用意として表に直に置く）
export function worldTablesOf(books: readonly Book[], others: readonly HomeOrFolder[]): Library {
  const tables = tablesOf(books)
  if (others.length === 0) return tables
  return { pages: tables.pages, folders: { ...tables.folders, ...Object.fromEntries(others.map(f => [f.id, f])) } }
}

// ステージに出す紙の大きさ（紙が無ければテストを落とす）
export function sheetOf(stage: Parameters<typeof paperOf>[0]) {
  const paper = paperOf(stage)
  if (paper === NO_PAPER) throw new Error("no paper")
  return paper
}

// 紙の置き場所（紙が無ければテストを落とす）
export function placedOf(stage: Parameters<typeof placement>[0]) {
  const at = placement(stage)
  if (at === NO_PAPER) throw new Error("no paper")
  return at
}

// 開いているページ（ページを開いていなければテストを落とす）
export function openedPageOf(opened: Parameters<typeof openedPage>[0]) {
  const page = openedPage(opened)
  if (page === NO_PAGE) throw new Error("no page")
  return page
}

// 置こうとしているアイテムの id（置こうとしていなければ undefined）
export const placingItemOf = (placing: Placing | typeof NO_PLACING): string | undefined =>
  placing === NO_PLACING ? undefined : placing.item
