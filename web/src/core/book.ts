// ブックの操作（データを書き換えず、新しい値を返す）。
// ブックの並び（lineup）を読む・書くのは、ここの関数だけ（ほかは book.lineup を直に歩かない。ページとフォルダの持ち方が変わっても、呼ぶ側を変えないため）

import { type CoreCatalog, pageType } from "./core-catalog"
import { freshPageId } from "./ids"
import { splitId } from "./names"
import type { PaperChoice } from "./paper"
import { type ItemPage, pageHolds, slideOf, walkShapes } from "./placed"
import type { AnyPage, Book, FolderEntry, LineupEntry, Page } from "./schema/book"
import { type Warning, warning } from "./warnings"

// 残しておいたブックを確かめる: このインスタンスのブックの形に合うものは books に、読めないものは warning（ページのタイプが無い W004・形が合わない W005・
// 並びの決まりやアイテムどうしの関係の決まりを守らない W006）にする。読めるが、機能台帳に無いアイテムや設定の項目を持つブックは partial に warning W007 を足す。
// 残したブックは外から来る値なので、形を確かめてから使う。読めないブックのデータには手を付けない
export function checkBooks(
  catalog: CoreCatalog,
  saved: readonly unknown[],
): { books: Book[]; warnings: Warning[]; partial: Warning[] } {
  const books: Book[] = []
  const warnings: Warning[] = []
  const partial: Warning[] = []
  for (const b of saved) {
    const raw = (typeof b === "object" && b !== null ? b : {}) as { id?: unknown; title?: unknown }
    const params = { book: String(raw.id ?? ""), title: typeof raw.title === "string" ? raw.title : "" }
    const unknown = rawPageTypes(b).find(t => !catalog.pageTypes.has(t))
    if (unknown !== undefined) {
      warnings.push(warning("W004", splitId(unknown).owner ?? "", { ...params, type: unknown }))
      continue
    }
    const parsed = catalog.bookSchema.safeParse(b)
    if (!parsed.success) warnings.push(warning("W005", "", params))
    else if (!holds(catalog, parsed.data as Book)) warnings.push(warning("W006", "", params))
    else {
      const book = parsed.data as Book
      books.push(book)
      const missing = missingIn(catalog, book)
      const [first] = missing
      if (first) partial.push(warning("W007", splitId(first).owner ?? "", { ...params, missing: missing.join(", ") }))
    }
  }
  return { books, warnings, partial }
}

// 形を確かめる前のブックの、ページのタイプの id（並びとフォルダの中。形が合わない所は飛ばす）
function rawPageTypes(book: unknown): string[] {
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const field = (v: unknown, k: string): unknown =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>)[k] : undefined
  const types = (entries: unknown[]): string[] =>
    entries.flatMap(e => {
      // ページのタイプと、フォルダが入れるタイプ
      const type = field(e, "kind") === "page" ? field(e, "type") : field(e, "pageType")
      return [...(typeof type === "string" ? [type] : []), ...types(list(field(e, "lineup")))]
    })
  return types(list(field(book, "lineup")))
}

// ブックが持つ、機能台帳に無いアイテム（どの深さの子の形も）と設定の項目の id（重ねずに、見つけた順）
function missingIn(catalog: CoreCatalog, book: Book): string[] {
  const found = new Set<string>()
  const settingsOf = (o: object) => Object.keys((o as { settings?: object }).settings ?? {})
  for (const k of settingsOf(book)) if (!catalog.settings.has(k)) found.add(k)
  for (const page of pagesOf(book)) {
    for (const k of settingsOf(page)) if (!catalog.settings.has(k)) found.add(k)
    for (const i of page.items ?? []) if (!catalog.items.has(i.item)) found.add(i.item)
    for (const { shape } of walkShapes(page)) if (!catalog.items.has(shape.item)) found.add(shape.item)
    for (const s of slideOf(page)) if (!catalog.items.has(s.item)) found.add(s.item)
  }
  return [...found]
}

// 残しておいたブックのうち、読めるものだけ（checkBooks の books）
export const restoreBooks = (catalog: CoreCatalog, saved: readonly unknown[]): Book[] =>
  checkBooks(catalog, saved).books

// ブックの並び（ページタブの順。1 つはページか、1 つのタイプのページだけを入れるフォルダ）
export const lineupOf = (book: Book): readonly LineupEntry[] => book.lineup

// このブックが持つページを、並びの順に（フォルダの中のページも、フォルダの所に続けて）。よそのページを指すだけの要素は含めない
export const pagesOf = (book: Book): readonly ItemPage[] =>
  book.lineup.flatMap((e): readonly ItemPage[] => (e.kind === "page" ? [e] : e.lineup))

// ブックのフォルダを、並びの順に
export const foldersOf = (book: Book): readonly FolderEntry[] =>
  book.lineup.flatMap(e => (e.kind === "folder" ? [e] : []))

// id のページと、それが入っているフォルダ（並びに直に入っているページは folder が null。無ければ undefined）
export function findPage(book: Book, id: string): { page: ItemPage; folder: FolderEntry | null } | undefined {
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (e.id === id) return { page: e, folder: null }
    } else {
      const found = e.lineup.find(p => p.id === id)
      if (found) return { page: found, folder: e }
    }
  }
  return undefined
}

// id の要素（ページかフォルダ）と同じ入れ物の並び: 並びに直に入っている要素ならブックの並び、フォルダの中のページならそのフォルダの並び（無ければ undefined）
export function siblingsOf(book: Book, id: string): readonly LineupEntry[] | undefined {
  if (book.lineup.some(e => e.id === id)) return book.lineup
  return foldersOf(book).find(f => f.lineup.some(p => p.id === id))?.lineup
}

// フォルダ folder の中のページを、並びの順に（フォルダが無ければ空）
export const pagesIn = (book: Book, folder: string): readonly ItemPage[] => findFolder(book, folder)?.lineup ?? []

export const findFolder = (book: Book, id: string): FolderEntry | undefined => foldersOf(book).find(f => f.id === id)

// 並びのページを 1 枚ずつ f で替える（フォルダの中も。f が undefined を返したページは除く）
function mapPages<B extends Book>(book: B, f: (page: AnyPage) => AnyPage | undefined): B {
  const lineup = book.lineup.flatMap((e): LineupEntry[] => {
    if (e.kind === "page") return [f(e)].flatMap(x => x ?? [])
    return [{ ...e, lineup: e.lineup.flatMap(p => f(p) ?? []) }]
  })
  return { ...book, lineup }
}

// ページを並びの要素にする。page に置いたアイテムがページのタイプの選んだものかは型では確かめられないので、ページの型だと言い張る
// （形は perform がアクションの後に機能台帳のブックの形で確かめ直す）
const entryOf = (page: ItemPage): AnyPage => page as AnyPage

// ブック book の、同じ id のページを page に替える（場所は変えない。無ければ何も変えない）
export function putPage<B extends Book>(book: B, page: ItemPage): B {
  return mapPages(book, e => (e.id === page.id ? entryOf(page) : e))
}

// ページを入れる所: 並びの index 番目（省けば末尾）か、フォルダ folder の中の index 番目（省けば末尾）
export type PageInto = { index?: number } | { folder: string; index?: number }

const insertAt = <T>(list: readonly T[], item: T, index?: number): T[] =>
  index === undefined || index >= list.length ? [...list, item] : [...list.slice(0, index), item, ...list.slice(index)]

// ページを into の所に足す（フォルダを名指して無ければ、何も変えない）
export function addPage<B extends Book>(book: B, page: ItemPage, into: PageInto = {}): B {
  if (!("folder" in into)) return { ...book, lineup: insertAt<LineupEntry>(book.lineup, entryOf(page), into.index) }
  return {
    ...book,
    lineup: book.lineup.map(e =>
      e.kind === "folder" && e.id === into.folder ? { ...e, lineup: insertAt(e.lineup, entryOf(page), into.index) } : e,
    ),
  }
}

// ブック book から、id が page のページを除く
export function removePage<B extends Book>(book: B, page: string): B {
  return mapPages(book, e => (e.id === page ? undefined : e))
}

// 並びの要素（ページかフォルダ）を、同じ入れ物の中の index 番目へ動かす（並びに直に入っている物は並びの中、フォルダの中のページはそのフォルダの中。
// index が後ろすぎれば末尾。id が無ければ何も変えない）
export function moveEntry<B extends Book>(book: B, id: string, index: number): B {
  const moved = <E extends LineupEntry>(list: readonly E[]): readonly E[] => {
    const entry = list.find(e => e.id === id)
    return entry
      ? insertAt(
          list.filter(e => e !== entry),
          entry,
          index,
        )
      : list
  }
  if (book.lineup.some(e => e.id === id)) return { ...book, lineup: moved(book.lineup) }
  return { ...book, lineup: book.lineup.map(e => (e.kind === "folder" ? { ...e, lineup: moved(e.lineup) } : e)) }
}

// フォルダを並びの index 番目に足す（省けば末尾）
export function addFolder<B extends Book>(book: B, folder: FolderEntry, index?: number): B {
  return { ...book, lineup: insertAt<LineupEntry>(book.lineup, folder, index) }
}

// id のフォルダを、f の返すフォルダに替える（場所は変えない）
export function putFolder<B extends Book>(book: B, id: string, f: (folder: FolderEntry) => FolderEntry): B {
  return { ...book, lineup: book.lineup.map(e => (e.kind === "folder" && e.id === id ? f(e) : e)) }
}

// id のフォルダを、中のページごと除く
export function removeFolder<B extends Book>(book: B, id: string): B {
  return { ...book, lineup: book.lineup.filter(e => !(e.kind === "folder" && e.id === id)) }
}

// 名前 title を、同じ入れ物の名前 taken と重ならない名前にする（重ならなければそのまま。重なれば「名前 2」から番号を付ける）
export function freeTitle(title: string, taken: readonly string[]): string {
  if (!taken.includes(title)) return title
  for (let n = 2; ; n++) {
    const made = `${title} ${n}`
    if (!taken.includes(made)) return made
  }
}

// ブックの中の id（ページとフォルダ）。新しい id を振るときに、重ならないようにする相手
export const lineupIds = (book: Book): string[] => [...pagesOf(book).map(p => p.id), ...foldersOf(book).map(f => f.id)]

// タイプのページで使えるアイテム（タイプの候補。データに置ける・引けるのはこの中だけ）
export function allowedItems(catalog: CoreCatalog, page: Pick<Page, "type">): readonly string[] {
  return pageType(catalog, page.type).items.allowed
}

// 新しいページ（まだブックに入れていない）。id は newId の値（uuid。ブックのほかのページ・フォルダと重ならない）
export function newPage(
  book: Book,
  init: { type: string; title: string; grows?: Page["grows"] } & PaperChoice,
  newId: () => string,
): Page {
  return { kind: "page", id: freshPageId(newId, lineupIds(book)), ...init }
}

// ブックかページの設定の項目（settings のフィールド）を変えた値: patch（項目の id → 値）の null の項目は消し、undefined の項目は変えない。
// 項目が 1 つも無くなれば settings のフィールドも消す
export function withSettings<T extends object>(target: T, patch: Readonly<Record<string, unknown>>): T {
  const settings: Record<string, unknown> = { ...(target as { settings?: Record<string, unknown> }).settings }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete settings[k]
    else if (v !== undefined) settings[k] = v
  }
  const { settings: _old, ...rest } = target as T & { settings?: unknown }
  return (Object.keys(settings).length > 0 ? { ...rest, settings } : rest) as T
}

// ブックが、データの形の外の決まりを守っているか:
// - ページとフォルダの id は、ブックの中で重ならない
// - まとまるタイプ（grouping が own-folder）のページは、そのタイプのフォルダの中にだけある。フォルダが入れるタイプは、まとまるタイプ
// - 同じ入れ物の中（ブックの並び・フォルダの中）で、名前（ページとフォルダの title）は重ならない
// - どのページも、タイプの決まり（holds）と、つなぐものの定義の決まりを守る
export function holds(catalog: CoreCatalog, book: Book): boolean {
  const ids = lineupIds(book)
  if (new Set(ids).size !== ids.length) return false
  const distinct = (entries: readonly LineupEntry[]) => new Set(entries.map(e => e.title)).size === entries.length
  if (!distinct(book.lineup) || !foldersOf(book).every(f => distinct(f.lineup))) return false
  const grouping = (type: string) => catalog.pageTypes.get(type)?.grouping
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (grouping(e.type) !== "none") return false
    } else if (grouping(e.pageType) !== "own-folder" || e.lineup.some(p => p.type !== e.pageType)) return false
  }
  return pagesOf(book).every(p => (pageType(catalog, p.type).holds?.(p, catalog) ?? true) && pageHolds(catalog, p))
}

// ブックを変えた前と後で、同じ id のページのタイプと、同じ id のフォルダが入れるタイプが同じか（どちらも、作ったあと変えない）
export function keepsPageTypes(before: Book, after: Book): boolean {
  const typed = (book: Book) => [
    ...pagesOf(book).map(p => [p.id, p.type] as const),
    ...foldersOf(book).map(f => [f.id, f.pageType] as const),
  ]
  const was = new Map(typed(before))
  return typed(after).every(([id, type]) => !was.has(id) || was.get(id) === type)
}

// ページの id から、そのページと、今それを持っているブック（ページの id はブックをまたいでも重ならない。同じ id のページが 2 冊にあれば、どちらとも決めずに無いとする）
export function pageById(
  books: Readonly<Record<string, Book>>,
  id: string,
): { book: Book; page: ItemPage; folder: FolderEntry | null } | undefined {
  let found: { book: Book; page: ItemPage; folder: FolderEntry | null } | undefined
  for (const book of Object.values(books)) {
    const at = findPage(book, id)
    if (!at) continue
    if (found) return undefined
    found = { book, ...at }
  }
  return found
}
