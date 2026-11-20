// ブックの操作（データを書き換えず、新しい値を返す）。
// ブックの並び（lineup）を読む・書くのは、ここの関数だけ（ほかは book.lineup を直に歩かない。ページとバインダの持ち方が変わっても、呼ぶ側を変えないため）

import { type CoreCatalog, pageType } from "./core-catalog"
import { isMoveRefusal, movedEntry, placeOf } from "./entries"
import {
  type AnyEntryRef,
  binderFolderOf,
  bookIdOf,
  bookOf,
  type Folder,
  foldersOver,
  HOME_ID,
  homeAndFoldersOf,
  isOpenRole,
  isUnreadableRole,
  type Library,
  type MovedCode,
  type PageRow,
  rawBooksOf,
  TRASH_ID,
  type TrashRef,
  tablesOf,
} from "./folders"
import { freshPageId } from "./ids"
import { splitId } from "./names"
import { type ItemPage, pageHolds, slideOf, walkShapes } from "./placed"
import { sameData } from "./same"
import type { AnyPage, BinderEntry, Book, LineupEntry, Page, UnreadableCode, UnreadableEntry } from "./schema/book"
import { type Warning, warning } from "./warnings"

// 残しておいたブックを確かめる: このインスタンスのブックの形に合うものは books に、読めないものは warning（形が合わない W005・並びの決まりを守らない W006）にする。
// 読めないページ（タイプが機能台帳に無い W027・タイプの形に合わない W028・タイプの決まりを守らない W029）は、ブックを読めるまま、読めないページのエントリに替えて partial に warning を足す。
// 読めるが、機能台帳に無いアイテムや設定の項目を持つブックも partial に warning W007 を足す。
// 残したブックは外から来る値なので、形を確かめてから使う。読めないブックと読めないページのデータには手を付けない。
// ブックとページとバインダの id は、渡した並びの全部の中で重ならない（ページもフォルダも、ちょうど 1 つのフォルダに入る）。先のブックがもう使っている id を持つブックは、読めないブック（W006）にする
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
    // 読めないページの無いブックは、ブックの形で 1 回確かめるだけで済ませる（ページごとには確かめ直さない）
    const whole = wholeBook(catalog, b)
    const marked = whole ? { book: whole, found: [] } : withUnreadable(catalog, b)
    const parsed = whole ? { success: true as const, data: whole } : catalog.bookSchema.safeParse(marked.book)
    if (!parsed.success) warnings.push(warning("W005", "", params))
    else if (!lineupHolds(catalog, parsed.data as Book)) warnings.push(warning("W006", "", params))
    else {
      const book = parsed.data as Book
      books.push(book)
      partial.push(...unreadableWarnings(marked.found, params))
      partial.push(...missingWarnings(missingIn(catalog, [book], pagesOf(book)), params))
    }
  }
  const distinct = distinctBooks(books)
  return {
    books: distinct.books,
    warnings: [...warnings, ...distinct.warnings],
    partial: partial.filter(p => distinct.books.some(b => b.id === p.params.book)),
  }
}

// 残したデータにタイプの id（文字列の type）が無いページの、warning に書くタイプ
const NO_TYPE = "(none)"

// 読めないページ found（ブック 1 冊の中か、ブックの外の全部）の warning: 番号ごとに 1 つ（タイプが無い W027 は、無いタイプごとに 1 つで、そのタイプの持ち主のプラグインの warning）。
// 何枚かを pages に持ち（1 枚ごとには出さない）、params（ブックの id と名前。ブックの外なら無し）を添える
function unreadableWarnings(found: readonly UnreadableEntry[], params: Readonly<Record<string, string>>): Warning[] {
  const groups = new Map<string, { code: UnreadableCode; type?: string; pages: number }>()
  for (const u of found) {
    const type = u.code === "W027" ? (u.type ?? NO_TYPE) : undefined
    const key = `${u.code} ${type ?? ""}`
    const group = groups.get(key) ?? { code: u.code, ...(type === undefined ? {} : { type }), pages: 0 }
    groups.set(key, { ...group, pages: group.pages + 1 })
  }
  return [...groups.values()].map(g =>
    warning(g.code, g.type === undefined ? "" : (splitId(g.type).owner ?? ""), {
      ...params,
      pages: `${g.pages}`,
      ...(g.type === undefined ? {} : { type: g.type }),
    }),
  )
}

// warning n が、ブック book の読めないページ u の warning か（同じ番号で、W027 なら無いタイプも同じ）
export const warnsOf = (n: Warning, book: string, u: UnreadableEntry): boolean =>
  n.params.book === book && n.code === u.code && (u.code !== "W027" || n.params.type === (u.type ?? NO_TYPE))

// 読めたブックの並び books のうち、先のブックがもう使っている id（ブック・ページ・バインダの id）を持たないブックと、持つブックの warning（W006。読めないブックにする）。
// ページもフォルダも、ちょうど 1 つのフォルダに入り、id は全部の中で重ならない
export function distinctBooks(books: readonly Book[]): { books: Book[]; warnings: Warning[] } {
  const taken = new Set<string>()
  const kept: Book[] = []
  const warnings: Warning[] = []
  for (const book of books) {
    const ids = [book.id, ...lineupIds(book)]
    if (ids.some(id => taken.has(id))) warnings.push(warning("W006", "", { book: book.id, title: book.title }))
    else {
      for (const id of ids) taken.add(id)
      kept.push(book)
    }
  }
  return { books: kept, warnings }
}

// 残したページ 1 枚（形を確かめる前）を今の機能台帳で読んだ物の覚え: 読めたら読んだページ、読めなければその理由の warning の番号
// （同じ値は覚えておき、読めるかの確かめとタイプの決まりの確かめを繰り返さない）
const pageChecks = new WeakMap<CoreCatalog, WeakMap<object, AnyPage | UnreadableCode>>()
function pageChecksOf(catalog: CoreCatalog): WeakMap<object, AnyPage | UnreadableCode> {
  let kept = pageChecks.get(catalog)
  if (!kept) {
    kept = new WeakMap()
    pageChecks.set(catalog, kept)
  }
  return kept
}

// 残したブック（形を確かめる前）が、読めないページを 1 枚も持たずにブックの形に合えば、読んだブック。合わない・読めないページがあるなら null
// （null のときは、ページごとに確かめて読めないページを分ける）
function wholeBook(catalog: CoreCatalog, saved: unknown): Book | null {
  const parsed = catalog.bookSchema.safeParse(saved)
  if (!parsed.success) return null
  const book = parsed.data as Book
  if (unreadableOf(book).length > 0) return null
  // 形に合ったので、残したページは読んだページと同じ順に並ぶ
  const raw = (saved as { lineup: readonly { kind: string; lineup?: readonly object[] }[] }).lineup.flatMap(
    (e): readonly object[] => (e.kind === "binder" ? (e.lineup ?? []) : [e]),
  )
  const kept = pageChecksOf(catalog)
  return pagesOf(book).every((page, i) => {
    const from = raw[i]
    const hit = from && kept.get(from)
    if (hit && typeof hit !== "string") return true
    const held =
      (catalog.pageTypes.get(page.type)?.holds?.(page as AnyPage, catalog) ?? true) && pageHolds(catalog, page)
    if (held && from) kept.set(from, page as AnyPage)
    return held
  })
    ? book
    : null
}

// ページ 1 枚 page が、機能台帳のそのタイプのページの形に合い、タイプの決まりと、つなぐものの定義の決まりを守っているか（ブックに入っていないページの確かめ）
export const pageSettles = (catalog: CoreCatalog, page: object): boolean => pageCheck(catalog, page) === "readable"

function pageCheck(catalog: CoreCatalog, page: object): UnreadableCode | "readable" {
  const read = pageRead(catalog, page)
  return typeof read === "string" ? read : "readable"
}

// 残したページ 1 枚（形を確かめる前）を、そのタイプのページの形で読んだページ。読めなければ、その理由の warning の番号（覚えから引く）
function pageRead(catalog: CoreCatalog, page: object): AnyPage | UnreadableCode {
  const kept = pageChecksOf(catalog)
  const hit = kept.get(page)
  if (hit) return hit
  const made = readPage(catalog, page)
  kept.set(page, made)
  return made
}

function readPage(catalog: CoreCatalog, page: object): AnyPage | UnreadableCode {
  const type = (page as { type?: unknown }).type
  const def = typeof type === "string" ? catalog.pageTypes.get(type) : undefined
  const schema = typeof type === "string" ? catalog.pageSchemas.get(type) : undefined
  const parsed = schema?.safeParse(page)
  if (!def || !parsed) return "W027"
  if (!parsed.success) return "W028"
  const read = parsed.data as AnyPage
  return (def.holds?.(read, catalog) ?? true) && pageHolds(catalog, read as ItemPage) ? read : "W029"
}

// 残したページ e（id は id）の、理由 code の読めないページのエントリ（名前とタイプは、残したデータが文字列で持つときだけ）
const unreadableEntryOf = (
  id: string,
  e: Readonly<Record<string, unknown>>,
  code: UnreadableCode,
): UnreadableEntry => ({
  kind: "unreadable",
  id,
  title: typeof e.title === "string" ? e.title : "",
  code,
  ...(typeof e.type === "string" ? { type: e.type } : {}),
})

// 残したブック（形を確かめる前）の並びとバインダの中の、読めないページを、読めないページのエントリに替えたブックと、替えたページ（id・理由の番号・タイプ）。
// id の無いページ・ページでもバインダでもない物は、そのまま残す（ブックの形に合わず、ブックごと読めない）
function withUnreadable(catalog: CoreCatalog, book: unknown): { book: unknown; found: UnreadableEntry[] } {
  const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
  const found: UnreadableEntry[] = []
  const entry = (e: unknown): unknown => {
    if (!isObject(e)) return e
    if (e.kind === "binder" && Array.isArray(e.lineup)) {
      const inner = e.lineup.map(entry)
      return inner.every((p, i) => p === (e.lineup as unknown[])[i]) ? e : { ...e, lineup: inner }
    }
    // 残したデータに読めないページのエントリの形は無い（組むときにだけ作る）。在れば、形に合わない物に替えてブックごと読めなくする
    if (e.kind === "unreadable") return { kind: "page" }
    if (e.kind !== "page" || typeof e.id !== "string" || e.id === "") return e
    const code = pageCheck(catalog, e)
    if (code === "readable") return e
    const made = unreadableEntryOf(e.id, e, code)
    found.push(made)
    return made
  }
  if (!isObject(book) || !Array.isArray(book.lineup)) return { book, found }
  const lineup = book.lineup.map(entry)
  return lineup.every((e, i) => e === (book.lineup as unknown[])[i])
    ? { book, found }
    : { book: { ...book, lineup }, found }
}

// ステージエントリ holders（ブック。ブックの外のページだけなら空）とページ pages が持つ、機能台帳に無いアイテム（どの深さの子の形も）と設定の項目の id（重ねずに、見つけた順）
function missingIn(catalog: CoreCatalog, holders: readonly object[], pages: readonly ItemPage[]): string[] {
  const found = new Set<string>()
  const settingsOf = (o: object) => Object.keys((o as { settings?: object }).settings ?? {})
  for (const h of holders) for (const k of settingsOf(h)) if (!catalog.settings.has(k)) found.add(k)
  for (const page of pages) {
    for (const k of settingsOf(page)) if (!catalog.settings.has(k)) found.add(k)
    for (const i of page.items ?? []) if (!catalog.items.has(i.item)) found.add(i.item)
    for (const { shape } of walkShapes(page)) if (!catalog.items.has(shape.item)) found.add(shape.item)
    for (const s of slideOf(page)) if (!catalog.items.has(s.item)) found.add(s.item)
  }
  return [...found]
}

// 機能台帳に無い物の id missing の warning W007（無ければ空。最初の物の持ち主のプラグインの warning）。params（ブックの id と名前。ブックの外なら無し）を添える
function missingWarnings(missing: readonly string[], params: Readonly<Record<string, string>>): Warning[] {
  const [first] = missing
  return first ? [warning("W007", splitId(first).owner ?? "", { ...params, missing: missing.join(", ") })] : []
}

// 残しておいたブックのうち、読めるものだけ（checkBooks の books）
export const restoreBooks = (catalog: CoreCatalog, saved: readonly unknown[]): Book[] =>
  checkBooks(catalog, saved).books

// 置き場所から読んだままの行を、今の機能台帳で読んだ書庫。library は書庫の表、books・warnings・partial は checkBooks と同じ（読めるブック・読めないブック・読めるブックの中の問題）、
// outsideWarnings はブックの外の問題（読めないページの warning W027〜W029 と、機能台帳に無い物の warning W007。ブックの外の全体で、理由ごとに 1 つ。ブックの id と名前は持たない）
export interface LibraryRead {
  library: Library
  books: readonly Book[]
  warnings: readonly Warning[]
  partial: readonly Warning[]
  outsideWarnings: readonly Warning[]
}

// 置き場所から読んだままのページの行 pageRows とフォルダの行 folderRows を、今の機能台帳で読んだ書庫の表と問題。
// 表に入るのは、読めるブック（checkBooks。ブックの中の読み方も同じ）を分けた行と、形に合う書庫ホーム・ゴミ箱・フォルダと、それらが直に持つブックの外のページとブックの外のバインダ。
// ブックの外のページは、そのタイプのページの形で読んだページか、読めなければ読めないページのエントリにする（残したデータには手を付けない）。
// ブックの外のバインダは、形に合い、中のページの行が全部在り、バインダの決まりを守るときだけ、中のページごと入れる。
// 入らなかった物を指す並びは、表に無い物を指すので、木の決まりが破れて見える（書庫が対象のアクションは断られる）。
// どのフォルダにも持たれていないページの行と、読めないブックの行と、読めない物のフォルダの行とその中の物の行は、表に入れない
export function readLibrary(
  catalog: CoreCatalog,
  allPages: readonly unknown[],
  allFolders: readonly unknown[],
): LibraryRead {
  const { pageRows, folderRows } = outsideUnreadable(allPages, allFolders)
  const checked = checkBooks(catalog, rawBooksOf(pageRows, folderRows))
  const tables = tablesOf(checked.books)
  const open = homeAndFoldersOf(folderRows)
  if (open.length === 0) return { library: tables, ...checked, outsideWarnings: [] }
  const pages: Record<string, PageRow> = { ...tables.pages }
  const folders: Record<string, Folder> = { ...tables.folders }
  for (const f of open) folders[f.id] = f
  const rowsById = (rows: readonly unknown[]) =>
    new Map(
      rows.flatMap(r =>
        typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string"
          ? [[(r as { id: string }).id, r as Readonly<Record<string, unknown>>] as const]
          : [],
      ),
    )
  const pageRow = rowsById(pageRows)
  const folderRow = rowsById(folderRows)
  // 持たれていて、まだ表に無いページの行を読んだ物（行が無い・もう表に在れば undefined。2 度持たれた物は、木の決まりが見る）
  const readOutside = (id: string): PageRow | undefined => {
    const raw = pageRow.get(id)
    return raw && !Object.hasOwn(pages, id) ? outsidePageOf(catalog, id, raw) : undefined
  }
  const read: PageRow[] = []
  const put = (row: PageRow) => {
    pages[row.id] = row
    read.push(row)
  }
  for (const f of open)
    for (const r of f.lineup) {
      if (r.kind === "page") {
        const row = readOutside(r.id)
        if (row) put(row)
      }
      if (r.kind !== "binder" || Object.hasOwn(folders, r.id)) continue
      const binder = binderFolderOf(folderRow.get(r.id))
      const inside = binder?.lineup.map(p => readOutside(p.id)) ?? []
      if (!binder || inside.some(p => p === undefined)) continue
      const rows = inside as PageRow[]
      const entry: BinderEntry = {
        kind: "binder",
        id: binder.id,
        title: binder.title,
        pageType: binder.pageType,
        lineup: rows,
      }
      if (!binderHolds(catalog, entry)) continue
      folders[binder.id] = binder
      for (const p of rows) put(p)
    }
  const readable = read.flatMap((p): readonly ItemPage[] => (p.kind === "page" ? [p] : []))
  const lost = read.filter((p): p is UnreadableEntry => p.kind === "unreadable")
  const outsideWarnings = [...unreadableWarnings(lost, {}), ...missingWarnings(missingIn(catalog, [], readable), {})]
  return { library: { pages, folders }, ...checked, outsideWarnings }
}

// 置き場所から読んだままの行のうち、読めない物のフォルダの行と、その中の物（何段下でも）の行を除いた物（書庫に入らない。同じ行の並びには同じ値を返す）
const outsideKept = new WeakMap<
  readonly unknown[],
  { pages: readonly unknown[]; out: { pageRows: readonly unknown[]; folderRows: readonly unknown[] } }
>()
function outsideUnreadable(
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
): { pageRows: readonly unknown[]; folderRows: readonly unknown[] } {
  const kept = outsideKept.get(folderRows)
  if (kept && kept.pages === pageRows) return kept.out
  const isUnreadable = (r: unknown) => isUnreadableRole((r as { folderRole?: unknown } | null)?.folderRole)
  const found = folderRows.find(isUnreadable) as { lineup?: unknown } | undefined
  const entries = Array.isArray(found?.lineup) ? (found.lineup as unknown[]) : []
  let out = { pageRows, folderRows }
  if (found) {
    const folder = rowsById(folderRows)
    const inside = new Set<string>()
    const walk = (id: string) => {
      if (inside.has(id)) return
      inside.add(id)
      const row = folder.get(id)
      for (const e of Array.isArray(row?.lineup) ? (row.lineup as unknown[]) : []) {
        const r = (e as { id?: unknown } | null)?.id
        if (typeof r === "string") walk(r)
      }
    }
    for (const e of entries) {
      const id = (e as { entry?: { id?: unknown } } | null)?.entry?.id
      if (typeof id === "string") walk(id)
    }
    const away = (r: unknown) => inside.has((r as { id?: unknown } | null)?.id as string)
    out = { pageRows: pageRows.filter(r => !away(r)), folderRows: folderRows.filter(r => !isUnreadable(r) && !away(r)) }
  }
  outsideKept.set(folderRows, { pages: pageRows, out })
  return out
}

// ブックの外のページの残した行 raw（id は id）を、表の 1 行にした物: 読めればタイプの形で読んだページ、読めなければ読めないページのエントリ
// （ページの種類でない行は、形に合わない W028）
function outsidePageOf(catalog: CoreCatalog, id: string, raw: Readonly<Record<string, unknown>>): PageRow {
  const read = raw.kind === "page" ? pageRead(catalog, raw) : "W028"
  return typeof read === "string" ? unreadableEntryOf(id, raw, read) : read
}

// ブックの並び（ページタブの順。1 つはページか、1 つのタイプのページだけを入れるバインダ）
export const lineupOf = (book: Book): readonly LineupEntry[] => book.lineup

// このブックが持つページを、並びの順に（バインダの中のページも、バインダの所に続けて）
export const pagesOf = (book: Book): readonly ItemPage[] =>
  book.lineup.flatMap((e): readonly ItemPage[] =>
    e.kind === "page" ? [e] : e.kind === "binder" ? e.lineup.filter(p => p.kind === "page") : [],
  )

// このブックの読めないページを、並びの順に（バインダの中の物も）
export const unreadableOf = (book: Book): readonly UnreadableEntry[] =>
  book.lineup.flatMap((e): readonly UnreadableEntry[] =>
    e.kind === "unreadable" ? [e] : e.kind === "binder" ? e.lineup.filter(p => p.kind === "unreadable") : [],
  )

// ブックのバインダを、並びの順に
export const bindersOf = (book: Book): readonly BinderEntry[] =>
  book.lineup.flatMap(e => (e.kind === "binder" ? [e] : []))

// id のページと、それが入っているバインダ（並びに直に入っているページは binder が null。無ければ undefined）
export function findPage(book: Book, id: string): { page: ItemPage; binder: BinderEntry | null } | undefined {
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (e.id === id) return { page: e, binder: null }
    } else if (e.kind === "binder") {
      const found = e.lineup.find(p => p.id === id)
      if (found?.kind === "page") return { page: found, binder: e }
    }
  }
  return undefined
}

// バインダ binder の中のエントリ（ページと読めないページ）を、並びの順に（バインダが無ければ空）
export const entriesIn = (book: Book, binder: string): readonly (ItemPage | UnreadableEntry)[] =>
  findBinder(book, binder)?.lineup ?? []

// id の読めないページと、それが入っているバインダ（並びに直に入っていれば binder が null。無ければ undefined）
export function findUnreadable(
  book: Book,
  id: string,
): { entry: UnreadableEntry; binder: BinderEntry | null } | undefined {
  for (const e of book.lineup) {
    if (e.kind === "unreadable") {
      if (e.id === id) return { entry: e, binder: null }
    } else if (e.kind === "binder") {
      const found = e.lineup.find(p => p.id === id)
      if (found?.kind === "unreadable") return { entry: found, binder: e }
    }
  }
  return undefined
}

// id の要素（ページかバインダ）と同じブックかバインダの並び: 並びに直に入っている要素ならブックの並び、バインダの中のページならそのバインダの並び（無ければ undefined）
export function siblingsOf(book: Book, id: string): readonly LineupEntry[] | undefined {
  if (book.lineup.some(e => e.id === id)) return book.lineup
  return bindersOf(book).find(f => f.lineup.some(p => p.id === id))?.lineup
}

// バインダ binder の中のページを、並びの順に（バインダが無ければ空）
export const pagesIn = (book: Book, binder: string): readonly ItemPage[] =>
  findBinder(book, binder)?.lineup.filter(p => p.kind === "page") ?? []

export const findBinder = (book: Book, id: string): BinderEntry | undefined => bindersOf(book).find(f => f.id === id)

// 並びのページを 1 枚ずつ f で替える（バインダの中も。f が undefined を返したページは除く）
function mapPages<B extends Book>(book: B, f: (page: AnyPage) => AnyPage | undefined): B {
  const lineup = book.lineup.flatMap((e): LineupEntry[] => {
    if (e.kind === "page") return [f(e)].flatMap(x => x ?? [])
    if (e.kind === "unreadable") return [e]
    const inner = e.lineup.flatMap((p): (AnyPage | UnreadableEntry)[] =>
      p.kind === "page" ? [f(p)].flatMap(x => x ?? []) : [p],
    )
    return [{ ...e, lineup: inner }]
  })
  return { ...book, lineup }
}

// ページをエントリにする。page に置いたアイテムがページのタイプの選んだものかは型では確かめられないので、ページの型だと言い張る
// （形は perform がアクションの後に機能台帳のブックの形で確かめ直す）
const entryOf = (page: ItemPage): AnyPage => page as AnyPage

// ブック book の、同じ id のページを page に替える（場所は変えない。無ければ何も変えない）
export function putPage<B extends Book>(book: B, page: ItemPage): B {
  return mapPages(book, e => (e.id === page.id ? entryOf(page) : e))
}

// ページを入れる所: 並びの index 番目（省けば末尾）か、バインダ binder の中の index 番目（省けば末尾）
export type PageInto = { index?: number } | { binder: string; index?: number }

const insertAt = <T>(list: readonly T[], item: T, index?: number): T[] =>
  index === undefined || index >= list.length ? [...list, item] : [...list.slice(0, index), item, ...list.slice(index)]

// 新しいページを入れる所: PageInto か、一緒に作るバインダ newBinder の中（バインダは並びの index 番目。省けば末尾）
export type NewPageInto = PageInto | { newBinder: NewBinder; index?: number }

// まだブックに入れていないページとバインダ（id は、足すときに振る）
export type NewPage = Omit<ItemPage, "id">
export type NewBinder = Omit<BinderEntry, "id" | "kind" | "lineup">

// ページ page（id を持たない中身）を into の所に足したブックと、振ったページの id（一緒にバインダを作ったなら、その id も）。名指したバインダが無ければ undefined。
// id は newId の値そのまま（uuid）で、ブックのほかのページ・バインダと重ならない。ページの id を決めて足す口は無い（id はここで振る）
export function addPage<B extends Book>(
  book: B,
  page: NewPage,
  into: NewPageInto,
  newId: () => string,
): { book: B; page: string; binder?: string } | undefined {
  const taken = lineupIds(book)
  const id = freshPageId(newId, taken)
  const { kind, ...rest } = page
  const entry = entryOf({ kind, id, ...rest })
  if ("newBinder" in into) {
    const binder: BinderEntry = {
      ...into.newBinder,
      kind: "binder",
      id: freshPageId(newId, [...taken, id]),
      lineup: [entry],
    }
    return {
      book: { ...book, lineup: insertAt<LineupEntry>(book.lineup, binder, into.index) },
      page: id,
      binder: binder.id,
    }
  }
  if (!("binder" in into))
    return { book: { ...book, lineup: insertAt<LineupEntry>(book.lineup, entry, into.index) }, page: id }
  if (!findBinder(book, into.binder)) return undefined
  const lineup = book.lineup.map(e =>
    e.kind === "binder" && e.id === into.binder ? { ...e, lineup: insertAt(e.lineup, entry, into.index) } : e,
  )
  return { book: { ...book, lineup }, page: id }
}

// ブック book から、id が page のページを除く
export function removePage<B extends Book>(book: B, page: string): B {
  return mapPages(book, e => (e.id === page ? undefined : e))
}

// エントリ（ページかバインダ）を、同じブックかバインダの中の index 番目（動かす物を除いて数える）へ動かす（並びに直に入っている物は並びの中、バインダの中のページはそのバインダの中。
// index が後ろすぎれば末尾。id が無いか、動かしても同じ場所なら何も変えない）。並べ替えの中身は、書庫の並びと同じ core/entries.ts の movedEntry
export function moveEntry<B extends Book>(book: B, id: string, index: number): B {
  const tables = tablesOf([book])
  const place = placeOf(tables.folders, id)
  if (!place) return book
  const moved = movedEntry(tables, id, place.holder.id, Math.min(index, place.holder.lineup.length - 1))
  return isMoveRefusal(moved) ? book : ((bookOf(moved, book.id) ?? book) as B)
}

// 空のバインダ binder（id を持たない）を並びの index 番目（省けば末尾）に足したブックと、振ったバインダの id（newId の値そのまま。ブックのほかの id と重ならない）
export function addBinder<B extends Book>(
  book: B,
  binder: NewBinder,
  index: number | undefined,
  newId: () => string,
): { book: B; binder: string } {
  const made: BinderEntry = { ...binder, kind: "binder", id: freshPageId(newId, lineupIds(book)), lineup: [] }
  return { book: { ...book, lineup: insertAt<LineupEntry>(book.lineup, made, index) }, binder: made.id }
}

// ブックの骨組み: ブックとバインダのフィールドはそのままで、ページを id だけにした値（ブックそのものとバインダだけを、中のページの中身と分けて比べるのに使う）
export function frameOf(book: Book): unknown {
  const stub = ({ id }: { id: string }) => ({ id })
  return {
    ...book,
    lineup: book.lineup.map(e => (e.kind === "binder" ? { ...e, lineup: e.lineup.map(stub) } : stub(e))),
  }
}

// id のバインダを、f の返すバインダに替える（場所は変えない）
export function putBinder<B extends Book>(book: B, id: string, f: (binder: BinderEntry) => BinderEntry): B {
  return { ...book, lineup: book.lineup.map(e => (e.kind === "binder" && e.id === id ? f(e) : e)) }
}

// id のバインダを、中のページごと除く
export function removeBinder<B extends Book>(book: B, id: string): B {
  return { ...book, lineup: book.lineup.filter(e => !(e.kind === "binder" && e.id === id)) }
}

// ブックの中の id（ページとバインダ）。新しい id を振るときに、重ならないようにする相手
const lineupIds = (book: Book): string[] => [
  ...pagesOf(book).map(p => p.id),
  ...unreadableOf(book).map(u => u.id),
  ...bindersOf(book).map(f => f.id),
]

// タイプのページで使えるアイテム（タイプの候補。データに置ける・引けるのはこの中だけ）
export function allowedItems(catalog: CoreCatalog, page: Pick<Page, "type">): readonly string[] {
  return pageType(catalog, page.type).items.allowed
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
// - ページとバインダの id は、ブックの中で重ならない
// - まとまるタイプ（grouping が binder）のページは、そのタイプのバインダの中にだけある。バインダが入れるタイプは、まとまるタイプ
// - 同じブックかバインダの中（ブックの並び・バインダの中）で、名前（ページとバインダの title）は重ならない
// - バインダの中のページは、紙と向きが同じ
// - どのページも、タイプの決まり（holds）と、つなぐものの定義の決まりを守る
export function holds(catalog: CoreCatalog, book: Book): boolean {
  if (!lineupHolds(catalog, book)) return false
  return pagesOf(book).every(p => (pageType(catalog, p.type).holds?.(p, catalog) ?? true) && pageHolds(catalog, p))
}

// ブックの並びの決まり（ページ 1 枚の中身に依らない決まり。破ればブックごと読めない）を守っているか。読めないページは、id と名前だけを見る
// （タイプが分からないので、並びに直に入るタイプか・バインダのタイプと同じか・紙と向きがそろうかは見ない。タイプが機能台帳に無いバインダは、中が読めないページだけで、空でなければ守っている）
function lineupHolds(catalog: CoreCatalog, book: Book): boolean {
  const ids = lineupIds(book)
  if (new Set(ids).size !== ids.length) return false
  if (!distinctTitles(book.lineup)) return false
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (catalog.pageTypes.get(e.type)?.grouping !== "none") return false
    } else if (e.kind === "binder" && !binderHolds(catalog, e)) return false
  }
  return true
}

// 名前の重なりの無い並びか。名前の無い読めないページ（残したデータに title が無い）は、名前の重なりに数えない
function distinctTitles(entries: readonly { title: string }[]): boolean {
  const titles = entries.map(e => e.title).filter(t => t !== "")
  return new Set(titles).size === titles.length
}

// バインダの決まり（ブックの中でも外でも同じ）を守っているか: 中の名前は重ならない／中のページは、入れるタイプのページ／入れるタイプは、まとまるタイプ
// （タイプが機能台帳に無いバインダは、中が読めないページだけ（1 枚以上）のときに限る）／中のページは、紙と向きが同じ。読めないページは、名前だけを見る
function binderHolds(catalog: CoreCatalog, binder: BinderEntry): boolean {
  if (!distinctTitles(binder.lineup)) return false
  const pages = binder.lineup.filter(p => p.kind === "page")
  if (pages.some(p => p.type !== binder.pageType)) return false
  const lost = !catalog.pageTypes.has(binder.pageType) && pages.length === 0 && binder.lineup.length > 0
  if (catalog.pageTypes.get(binder.pageType)?.grouping !== "binder" && !lost) return false
  return sharesPaper(binder)
}

// バインダの中のページが、紙と向きをそろえているか
function sharesPaper(binder: BinderEntry): boolean {
  const pages = binder.lineup.filter(p => p.kind === "page")
  const lead = pages[0]
  return pages.every(p => p.paper === lead?.paper && p.orientation === lead.orientation)
}

// ブックを変えた前と後で、同じ id のページのタイプと、同じ id のバインダが入れるタイプが同じか（どちらも、作ったあと変えない）
export const keepsPageTypes = (before: Book, after: Book): boolean => keepsPageTypesAcross([before], [after])

// ブックの並びを変えた前と後で、同じ id のページのタイプと、同じ id のバインダが入れるタイプが同じか（ページやバインダが、ブックの間を動いていても）
export function keepsPageTypesAcross(before: readonly Book[], after: readonly Book[]): boolean {
  const typed = (book: Book) => [
    ...pagesOf(book).map(p => [p.id, p.type] as const),
    ...bindersOf(book).map(f => [f.id, f.pageType] as const),
  ]
  const was = new Map(before.flatMap(typed))
  return after.flatMap(typed).every(([id, type]) => !was.has(id) || was.get(id) === type)
}

// ブックを変えた前と後で、読めないページがどれも、同じフォルダ（ブックの並びか、同じバインダ）に同じ値・同じ順で残り、増えてもいないか
// （読めないページには何もできない）。保っていなければ、保たれなかった読めないページ（前に在った物か、後に増えた物）
export function lostUnreadable(before: Book | undefined, after: Book): UnreadableEntry | null {
  const held = (book: Book): Map<string, readonly UnreadableEntry[]> =>
    new Map([
      [book.id, book.lineup.filter(e => e.kind === "unreadable")],
      ...bindersOf(book).map(f => [f.id, f.lineup.filter(p => p.kind === "unreadable")] as const),
    ])
  const was = before ? held(before) : new Map<string, readonly UnreadableEntry[]>()
  const now = held(after)
  for (const [folder, entries] of was) {
    const kept = now.get(folder) ?? []
    const lost = entries.find((e, i) => !sameData(e, kept[i]))
    if (lost) return lost
  }
  for (const [folder, entries] of now) {
    const added = entries[was.get(folder)?.length ?? 0]
    if (added) return added
  }
  return null
}

// 書庫を変えた前 was と後 now で、ブックの外の読めないページがどれも、同じフォルダ（ブック・バインダを含む）に同じ値で残り、ブックの外に増えてもいないか
// （読めないページには何もできない。ブックの中の読めないページは lostUnreadable が見る）。保っていなければ、保たれなかった読めないページ（前に在った物か、後に増えた物）
export function lostUnreadableOutside(was: Library, now: Library): UnreadableEntry | null {
  if (was.pages === now.pages && was.folders === now.folders) return null
  const holderOf = (library: Library, id: string) => foldersOver(library.folders, id)[0]?.id
  const outside = (library: Library, id: string, row: PageRow | undefined): row is UnreadableEntry =>
    row?.kind === "unreadable" && bookIdOf(library.folders, id) === undefined
  for (const [id, row] of Object.entries(was.pages)) {
    if (!outside(was, id, row)) continue
    const kept = now.pages[id]
    if (!kept || !sameData(row, kept) || holderOf(was, id) !== holderOf(now, id)) return row
  }
  for (const [id, row] of Object.entries(now.pages))
    if (outside(now, id, row) && !outside(was, id, was.pages[id])) return row
  return null
}

// ページの id から、そのページと、今それを持っているブック（ページの id はブックをまたいでも重ならない。同じ id のページが 2 冊にあれば、どちらとも決めずに無いとする）
export function pageById(
  books: Readonly<Record<string, Book>>,
  id: string,
): { book: Book; page: ItemPage; binder: BinderEntry | null } | undefined {
  let found: { book: Book; page: ItemPage; binder: BinderEntry | null } | undefined
  for (const book of Object.values(books)) {
    const at = findPage(book, id)
    if (!at) continue
    if (found) return undefined
    found = { book, ...at }
  }
  return found
}

// 読めない物 1 つ（読めない物のフォルダへ移す単位）: 在る所 holder（フォルダの id）の並びのエントリ element（置き場所から読んだまま。ゴミ箱の中なら TrashRef）と、理由の番号 code と、
// 機能台帳に無いタイプの id type（W027 で、行が文字列で持つときだけ）
export interface UnreadableUnit {
  element: AnyEntryRef | TrashRef
  holder: string
  code: MovedCode
  type?: string
}

// 置き場所から読んだままの行 pageRows・folderRows のうち、今の機能台帳で読めない物の全部（書庫ホームとゴミ箱から木をたどった順）。
// 外側の物を 1 つだけ数える: ページ（W027〜W029）は、それだけで読めなければ 1 枚ずつ。バインダは、形に合わない（W028）・タイプが機能台帳に無い（W027）・
// 読めるページだけでバインダの決まりを守らない（W029）ならバインダごと。ブックは、読めない物を除いてもブックの形に合わない（W005）・並びの決まりを守らない、
// 先に数えたブックと id が重なる（W006）ならブックごと（中の物は数えない）。
// 木の決まりを破る物（行の無いエントリ・種類と役の合わないエントリ・どこにも持たれていない行）と、読めない物のフォルダの中の物は数えない
export function unreadableUnitsOf(
  catalog: CoreCatalog,
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
): UnreadableUnit[] {
  const page = rowsById(pageRows)
  const folder = rowsById(folderRows)
  const units: UnreadableUnit[] = []
  const passed = new Set<string>()
  const books: { book: Book; unit: UnreadableUnit; inner: UnreadableUnit[] }[] = []
  // ページの行 id を読んだ物（行が無ければ undefined。ページの種類でない行は、形に合わない W028）
  const readRow = (id: string): AnyPage | UnreadableCode | undefined => {
    const raw = page.get(id)
    if (!raw) return undefined
    return raw.kind === "page" ? pageRead(catalog, raw) : "W028"
  }
  const typeOf = (raw: Readonly<Record<string, unknown>> | undefined, key: "type" | "pageType") =>
    typeof raw?.[key] === "string" ? { type: raw[key] as string } : {}
  // ページ 1 枚: 読めれば読んだページ、読めなければ単位、行が無ければ undefined
  const judgePage = (element: AnyEntryRef | TrashRef, holder: string): AnyPage | UnreadableUnit | undefined => {
    const read = readRow(element.id)
    if (read === undefined) return undefined
    if (typeof read !== "string") return read
    return { element, holder, code: read, ...(read === "W027" ? typeOf(page.get(element.id), "type") : {}) }
  }
  // バインダ 1 つ: 読めれば読んだバインダと、中の読めないページ。バインダごと読めなければ単位。行の無い物を持てば undefined
  const judgeBinder = (
    element: AnyEntryRef | TrashRef,
    holder: string,
  ): { binder: BinderEntry; inner: UnreadableUnit[] } | UnreadableUnit | undefined => {
    const raw = folder.get(element.id)
    if (raw?.folderRole !== "binder") return undefined
    const row = binderFolderOf(raw)
    if (!row) return { element, holder, code: "W028" }
    if (row.lineup.some(p => !page.has(p.id))) return undefined
    if (!catalog.pageTypes.has(row.pageType)) return { element, holder, code: "W027", type: row.pageType }
    const inner: UnreadableUnit[] = []
    const kept: AnyPage[] = []
    for (const p of row.lineup) {
      const read = judgePage(p, row.id)
      if (read && "element" in read) inner.push(read)
      else if (read) kept.push(read)
    }
    const binder: BinderEntry = { kind: "binder", id: row.id, title: row.title, pageType: row.pageType, lineup: kept }
    return binderHolds(catalog, binder) ? { binder, inner } : { element, holder, code: "W029" }
  }
  // ブック 1 冊: 読めない物を除いて組み、形と並びの決まりを確かめる（id の重なりは、全部を見てから）
  const judgeBook = (element: AnyEntryRef | TrashRef, holder: string) => {
    const raw = folder.get(element.id)
    if (!raw || isOpenRole(raw.folderRole) || raw.folderRole === "binder" || isUnreadableRole(raw.folderRole)) return
    const unit: UnreadableUnit = { element, holder, code: "W005" }
    if (!Array.isArray(raw.lineup)) {
      units.push(unit)
      return
    }
    const inner: UnreadableUnit[] = []
    const lineup: unknown[] = []
    for (const e of raw.lineup as unknown[]) {
      const r = refOf(e)
      if (r?.kind === "page") {
        const read = judgePage(r, element.id)
        if (read === undefined) return
        if ("element" in read) inner.push(read)
        else lineup.push(page.get(r.id))
      } else if (r?.kind === "binder") {
        const read = judgeBinder(r, element.id)
        if (read === undefined) return
        if ("element" in read) inner.push(read)
        else {
          inner.push(...read.inner)
          const { folderRole: _, ...fields } = folder.get(r.id) as Readonly<Record<string, unknown>>
          const kept = new Set(read.binder.lineup.map(p => p.id))
          const pages = (fields.lineup as readonly { id: string }[])
            .filter(p => kept.has(p.id))
            .map(p => page.get(p.id))
          lineup.push({ kind: "binder", ...fields, lineup: pages })
        }
      } else lineup.push(e)
    }
    const { folderRole: _, ...fields } = raw
    const parsed = catalog.bookSchema.safeParse({ ...fields, lineup })
    if (!parsed.success) units.push(unit)
    else if (!lineupHolds(catalog, parsed.data as Book)) units.push({ ...unit, code: "W006" })
    else books.push({ book: parsed.data as Book, unit: { ...unit, code: "W006" }, inner })
  }
  const visit = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    const row = folder.get(id)
    if (!row || !isOpenRole(row.folderRole) || !Array.isArray(row.lineup)) return
    for (const e of row.lineup as unknown[]) {
      const r = refOf(e, true)
      if (!r) continue
      const element = e as AnyEntryRef | TrashRef
      if (r.kind === "page") {
        const read = judgePage(element, id)
        if (read && "element" in read) units.push(read)
      } else if (r.kind === "binder") {
        const read = judgeBinder(element, id)
        if (read && "element" in read) units.push(read)
        else if (read) units.push(...read.inner)
      } else if (r.kind === "book") judgeBook(element, id)
      else if (r.kind === "folder") visit(r.id)
    }
  }
  visit(HOME_ID)
  visit(TRASH_ID)
  const distinct = new Set(distinctBooks(books.map(b => b.book)).books)
  for (const b of books) {
    if (distinct.has(b.book)) units.push(...b.inner)
    else units.push(b.unit)
  }
  // 2 度持たれた物は、木の決まりを破る物なので数えない
  const held = new Map<string, number>()
  for (const f of folder.values())
    for (const e of Array.isArray(f.lineup) ? (f.lineup as unknown[]) : []) {
      const r = refOf(e, true)
      if (r) held.set(r.id, (held.get(r.id) ?? 0) + 1)
    }
  return units.filter(u => held.get(u.element.id) === 1)
}

// 行の並び rows の、id → 行（id を文字列で持つ物だけ）
const rowsById = (rows: readonly unknown[]): Map<string, Readonly<Record<string, unknown>>> =>
  new Map(
    rows.flatMap(r =>
      typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string"
        ? [[(r as { id: string }).id, r as Readonly<Record<string, unknown>>] as const]
        : [],
    ),
  )

// 並びのエントリ e が指す物の種類と id（id だけのエントリでなければ undefined。trash なら、ゴミ箱の並びのエントリの入れた時刻と元の列も許す）
function refOf(e: unknown, trash = false): AnyEntryRef | undefined {
  if (typeof e !== "object" || e === null) return undefined
  const { kind, id } = e as { kind?: unknown; id?: unknown }
  if (!trash && Object.keys(e).length !== 2) return undefined
  if (typeof id !== "string" || id === "") return undefined
  return kind === "page" || kind === "binder" || kind === "book" || kind === "folder"
    ? ({ kind, id } as AnyEntryRef)
    : undefined
}
