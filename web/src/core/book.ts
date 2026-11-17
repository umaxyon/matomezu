// ブックの操作（データを書き換えず、新しい値を返す）。
// ブックの並び（lineup）を読む・書くのは、ここの関数だけ（ほかは book.lineup を直に歩かない。ページとバインダの持ち方が変わっても、呼ぶ側を変えないため）

import { type CoreCatalog, pageType } from "./core-catalog"
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
    const marked = withUnreadable(catalog, b)
    const parsed = catalog.bookSchema.safeParse(marked.book)
    if (!parsed.success) warnings.push(warning("W005", "", params))
    else if (!lineupHolds(catalog, parsed.data as Book)) warnings.push(warning("W006", "", params))
    else {
      const book = parsed.data as Book
      books.push(book)
      partial.push(...unreadableWarnings(marked.found, params))
      const missing = missingIn(catalog, book)
      const [first] = missing
      if (first) partial.push(warning("W007", splitId(first).owner ?? "", { ...params, missing: missing.join(", ") }))
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

// ブック 1 冊の読めないページ found の warning: 番号ごとに 1 つ（タイプが無い W027 は、無いタイプごとに 1 つで、そのタイプの持ち主のプラグインの warning）。
// 何枚かを pages に持つ（1 枚ごとには出さない）
function unreadableWarnings(found: readonly UnreadableEntry[], params: { book: string; title: string }): Warning[] {
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

// 残したページ 1 枚（形を確かめる前）が、今の機能台帳で読めるか: 読めなければ、その理由の warning の番号
// （同じ値は覚えておき、読めるかの確かめとタイプの決まりの確かめを繰り返さない）
const pageChecks = new WeakMap<CoreCatalog, WeakMap<object, UnreadableCode | "readable">>()
function pageCheck(catalog: CoreCatalog, page: object): UnreadableCode | "readable" {
  let kept = pageChecks.get(catalog)
  if (!kept) {
    kept = new WeakMap()
    pageChecks.set(catalog, kept)
  }
  const hit = kept.get(page)
  if (hit) return hit
  const type = (page as { type?: unknown }).type
  const def = typeof type === "string" ? catalog.pageTypes.get(type) : undefined
  const schema = typeof type === "string" ? catalog.pageSchemas.get(type) : undefined
  const parsed = schema?.safeParse(page)
  const made: UnreadableCode | "readable" =
    !def || !parsed
      ? "W027"
      : !parsed.success
        ? "W028"
        : (def.holds?.(parsed.data as AnyPage, catalog) ?? true) && pageHolds(catalog, parsed.data as ItemPage)
          ? "readable"
          : "W029"
  kept.set(page, made)
  return made
}

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
    const made: UnreadableEntry = {
      kind: "unreadable",
      id: e.id,
      title: typeof e.title === "string" ? e.title : "",
      code,
      ...(typeof e.type === "string" ? { type: e.type } : {}),
    }
    found.push(made)
    return made
  }
  if (!isObject(book) || !Array.isArray(book.lineup)) return { book, found }
  const lineup = book.lineup.map(entry)
  return lineup.every((e, i) => e === (book.lineup as unknown[])[i])
    ? { book, found }
    : { book: { ...book, lineup }, found }
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

// エントリ（ページかバインダ）を、同じブックかバインダの中の index 番目へ動かす（並びに直に入っている物は並びの中、バインダの中のページはそのバインダの中。
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
  return { ...book, lineup: book.lineup.map(e => (e.kind === "binder" ? { ...e, lineup: moved(e.lineup) } : e)) }
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

// 名前 title を、同じブックかバインダの名前 taken と重ならない名前にする（重ならなければそのまま。重なれば「名前 2」から番号を付ける）
export function freeTitle(title: string, taken: readonly string[]): string {
  if (!taken.includes(title)) return title
  for (let n = 2; ; n++) {
    const made = `${title} ${n}`
    if (!taken.includes(made)) return made
  }
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
  // 名前の無い読めないページ（残したデータに title が無い）は、名前の重なりに数えない
  const distinct = (entries: readonly { title: string }[]) => {
    const titles = entries.map(e => e.title).filter(t => t !== "")
    return new Set(titles).size === titles.length
  }
  if (!distinct(book.lineup) || !bindersOf(book).every(f => distinct(f.lineup))) return false
  const grouping = (type: string) => catalog.pageTypes.get(type)?.grouping
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (grouping(e.type) !== "none") return false
    } else if (e.kind === "binder") {
      const pages = e.lineup.filter(p => p.kind === "page")
      if (pages.some(p => p.type !== e.pageType)) return false
      // タイプが機能台帳に無いバインダは、中が読めないページだけ（1 枚以上）のときに限る
      const lost = !catalog.pageTypes.has(e.pageType) && pages.length === 0 && e.lineup.length > 0
      if (grouping(e.pageType) !== "binder" && !lost) return false
    }
  }
  return bindersOf(book).every(sharesPaper)
}

// バインダの中のページが、紙と向きをそろえているか
function sharesPaper(binder: BinderEntry): boolean {
  const pages = binder.lineup.filter(p => p.kind === "page")
  const lead = pages[0]
  return pages.every(p => p.paper === lead?.paper && p.orientation === lead.orientation)
}

// ブックを変えた前と後で、同じ id のページのタイプと、同じ id のバインダが入れるタイプが同じか（どちらも、作ったあと変えない）
export function keepsPageTypes(before: Book, after: Book): boolean {
  const typed = (book: Book) => [
    ...pagesOf(book).map(p => [p.id, p.type] as const),
    ...bindersOf(book).map(f => [f.id, f.pageType] as const),
  ]
  const was = new Map(typed(before))
  return typed(after).every(([id, type]) => !was.has(id) || was.get(id) === type)
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
