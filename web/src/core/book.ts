// ブックの操作（データを書き換えず、新しい値を返す）。
// ブックの並び（lineup）を読む・書くのは、ここの関数だけ（ほかは book.lineup を直に歩かない。ページとバインダの持ち方が変わっても、呼ぶ側を変えないため）

import { type CoreCatalog, pageType } from "./core-catalog"
import { placeOf } from "./entries"
import {
  type AnyEntryRef,
  binderFolderOf,
  type Folder,
  homeAndFoldersOf,
  isBookRole,
  isOpenRole,
  type Library,
  libraryTopIdsIn,
  type MovedCode,
  namesHomeOrFolder,
  type PageRow,
  type TrashRef,
} from "./folders"
import { tablesOf } from "./folders-books"
import { outsideUnreadable, rawBooksOf, rowsById } from "./folders-unreadable"
import { freshPageId } from "./ids"
import { splitId } from "./names"
import { type ItemPage, pageHolds, slideOf, walkShapes } from "./placed"
import type {
  AnyPage,
  BinderEntry,
  Book,
  LineupEntry,
  OutermostSettings,
  Page,
  StageLineup,
  UnreadableCode,
} from "./schema/book"
import { type Warning, warning } from "./warnings"

// 残しておいたブックを確かめる: このインスタンスのブックの形に合うものは books に、読めないものは warning にする（judgeBook の判定。1 冊に 1 つ）。
// ブックごと読めないブック（形が合わない W005・並びの決まりを守らない W006）と、先のブックがもう使っている id を持つブック（W006）はその訳で、
// 中に読めない物（ページ W027〜W029・バインダ W027〜W029）を持つブックは、最初の読めない物の訳で、読めないブックにする
// （中の読めない物は常駐が読めない物のフォルダへ移すので、残るのは移す前だけ。窓は、追加プラグインのどれかを組めなければ起動を止める）。
// 読めるが、機能台帳に無いアイテムや設定の項目を持つブックも partial に warning W007 を足す。
// 残したブックは外から来る値なので、形を確かめてから使う。読めないブックと読めない物のデータには手を付けない。
// ブックとページとバインダの id は、渡した並びの全部の中で重ならない（ページもフォルダも、ちょうど 1 つのフォルダに入る。比べるのは、読めない物を除いたブック）
export function checkBooks(
  catalog: CoreCatalog,
  saved: readonly unknown[],
): { books: Book[]; warnings: Warning[]; partial: Warning[] } {
  const judged = saved.map(b => {
    const raw = (typeof b === "object" && b !== null ? b : {}) as { id?: unknown; title?: unknown }
    const params = { book: String(raw.id ?? ""), title: typeof raw.title === "string" ? raw.title : "" }
    return { params, read: judgeBook(catalog, b) }
  })
  const distinct = new Set(distinctBooks(judged.flatMap(({ read }) => ("book" in read ? [read.book] : []))).books)
  const books: Book[] = []
  const warnings: Warning[] = []
  const partial: Warning[] = []
  for (const { params, read } of judged) {
    if (!("book" in read)) warnings.push(warning(read.code, "", params))
    else if (!distinct.has(read.book)) warnings.push(warning("W006", "", params))
    // 中に読めない物を持つブックの warning も、ほかの訳と同じに 1 冊に 1 つ（最初の物の訳。常駐はブックごとに 1 つ持つ）
    else if (read.inner.length > 0) warnings.push(...unreadableWarnings(read.inner, params).slice(0, 1))
    else {
      books.push(read.book)
      partial.push(
        ...missingWarnings(missingIn(catalog, [read.book], pagesOf(read.book)), {
          ...params,
          kind: "book",
          id: params.book,
        }),
      )
    }
  }
  return { books, warnings, partial }
}

// 残したデータにタイプの id（文字列の type）が無いページの、warning に書くタイプ
const NO_TYPE = "(none)"

// 読めない物 1 つ（judgeBook・judgeBinder が見つけた、読めないページかバインダ）: 種類 kind と id と、それを並びに持つ物 holder（ブックかバインダの id）と、
// 理由の番号 code と、機能台帳に無いタイプの id type（W027 で、データが文字列で持つときだけ）
interface Lost {
  kind: "page" | "binder"
  id: string
  holder: string
  code: UnreadableCode
  type?: string
}

// ブック 1 冊の中の読めないページ found の warning: 番号ごとに 1 つ（タイプが無い W027 は、無いタイプごとに 1 つ）。
// 何枚かを pages に持ち（1 枚ごとには出さない）、params（ブックの id と名前）を添える
function unreadableWarnings(found: readonly Lost[], params: Readonly<Record<string, string>>): Warning[] {
  const groups = new Map<string, { code: UnreadableCode; type?: string; pages: number }>()
  for (const u of found) {
    const type = u.code === "W027" ? (u.type ?? NO_TYPE) : undefined
    const key = `${u.code} ${type ?? ""}`
    const group = groups.get(key) ?? { code: u.code, ...(type === undefined ? {} : { type }), pages: 0 }
    groups.set(key, { ...group, pages: group.pages + 1 })
  }
  return [...groups.values()].map(g =>
    warning(g.code, "", {
      ...params,
      pages: `${g.pages}`,
      ...(g.type === undefined ? {} : { type: g.type }),
    }),
  )
}

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
// 覚えは形ごとに分ける（同じページの値が、ブックの外のページ 1 枚としても、ブックかバインダの中のページとしても確かめられる）
const pageChecks = new WeakMap<CoreCatalog, WeakMap<object, AnyPage | UnreadableCode>>()
const stageEntryPageChecks = new WeakMap<CoreCatalog, WeakMap<object, AnyPage | UnreadableCode>>()
const pageChecksOf = (catalog: CoreCatalog, stageEntry = false) =>
  keptFor(stageEntry ? stageEntryPageChecks : pageChecks, catalog)

// 機能台帳 catalog の覚え（無ければ作る。機能台帳を組み直すと、新しい台帳の覚えになる）
function keptFor<T>(all: WeakMap<CoreCatalog, WeakMap<object, T>>, catalog: CoreCatalog): WeakMap<object, T> {
  let kept = all.get(catalog)
  if (!kept) {
    kept = new WeakMap()
    all.set(catalog, kept)
  }
  return kept
}

// 残したブック（形を確かめる前）が、ブックの形に合い、どのページもタイプが機能台帳に在ってタイプの決まりを守れば、読んだブック。そうでなければ null
// （null のときは、ページごとに確かめて読めないページを探す）
function wholeBook(catalog: CoreCatalog, saved: unknown): Book | null {
  const parsed = catalog.bookSchema.safeParse(saved)
  if (!parsed.success) return null
  const book = parsed.data as Book
  // 形に合ったので、残したページは読んだページと同じ順に並ぶ
  const raw = (saved as { lineup: readonly { kind: string; lineup?: readonly object[] }[] }).lineup.flatMap(
    (e): readonly object[] => (e.kind === "binder" ? (e.lineup ?? []) : [e]),
  )
  const kept = pageChecksOf(catalog)
  return pagesOf(book).every((page, i) => {
    const from = raw[i]
    const hit = from && kept.get(from)
    if (hit && typeof hit !== "string") return true
    const held = typeRulesHold(catalog, page as AnyPage)
    if (held && from) kept.set(from, page as AnyPage)
    return held
  })
    ? book
    : null
}

// ページ 1 枚 page が、機能台帳のそのタイプのページの形に合い、タイプの決まりと、つなぐものの定義の決まりを守っているか（ブックに入っていないページの確かめ）。
// stageEntry は、ブックの外のページ 1 枚か（true なら、ステージエントリが持つ設定の項目の値も受ける形。ブックの外のバインダの中のページは false）
export const pageSettles = (catalog: CoreCatalog, page: object, stageEntry: boolean): boolean =>
  typeof pageRead(catalog, page, stageEntry) !== "string"

// 残したページ 1 枚 page を、そのタイプのページの形で読んだページ（ブックに入っていないページを読む。読めなければ undefined）。stageEntry は pageSettles と同じ
export function readablePage(catalog: CoreCatalog, page: object, stageEntry: boolean): AnyPage | undefined {
  const read = pageRead(catalog, page, stageEntry)
  return typeof read === "string" ? undefined : read
}

// 残したページ 1 枚（形を確かめる前）を、そのタイプのページの形で読んだページ。読めなければ、その理由の warning の番号（覚えから引く）。
// stageEntry が true なら、ブックの外のページ 1 枚の形で読む
function pageRead(catalog: CoreCatalog, page: object, stageEntry = false): AnyPage | UnreadableCode {
  const kept = pageChecksOf(catalog, stageEntry)
  const hit = kept.get(page)
  if (hit) return hit
  const made = readPage(catalog, page, stageEntry)
  kept.set(page, made)
  return made
}

function readPage(catalog: CoreCatalog, page: object, stageEntry: boolean): AnyPage | UnreadableCode {
  const type = (page as { type?: unknown }).type
  const def = typeof type === "string" ? catalog.pageTypes.get(type) : undefined
  const schemas = stageEntry ? catalog.stageEntryPageSchemas : catalog.pageSchemas
  const schema = typeof type === "string" ? schemas.get(type) : undefined
  const parsed = schema?.safeParse(page)
  if (!def || !parsed) return "W027"
  if (!parsed.success) return "W028"
  const read = parsed.data as AnyPage
  return typeRulesHold(catalog, read) ? read : "W029"
}

// 形を読んだページ page が、そのタイプが機能台帳に在り、タイプの決まり（holds）と、つなぐものの定義の決まりを守るか（読めるかの決まりの確かめは、ここ 1 つ）
function typeRulesHold(catalog: CoreCatalog, page: AnyPage): boolean {
  const def = catalog.pageTypes.get(page.type)
  return def !== undefined && (def.holds?.(page, catalog) ?? true) && pageHolds(catalog, page as ItemPage)
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

// 中身の無い、id だけのエントリ（行の無い物を指したまま組まれた物）か
const idOnly = (e: unknown): boolean => isRecord(e) && Object.keys(e).length === 2 && typeof e.id === "string"

// 機能台帳に無いタイプの id を、データが文字列で持つときだけ添える
const typeIn = (raw: Readonly<Record<string, unknown>>, key: "type" | "pageType") =>
  typeof raw[key] === "string" ? { type: raw[key] as string } : {}

// 残したページ 1 枚 raw（形を確かめる前）を今の機能台帳で読んだページか、読めない訳の番号（ページの種類でなければ、形に合わない W028）
const judgePage = (
  catalog: CoreCatalog,
  raw: Readonly<Record<string, unknown>>,
  stageEntry = false,
): AnyPage | UnreadableCode => (raw.kind === "page" ? pageRead(catalog, raw, stageEntry) : "W028")

// 残したバインダ 1 つ raw（並びのエントリの形で、中のページは中身ごと。形を確かめる前）を今の機能台帳で読んだ物。
// バインダごと読めなければ、その訳: 形に合わない W028・入れるタイプが機能台帳に無い W027・読めるページだけでバインダの決まりを守らない W029。
// 読めれば、読めるページだけのバインダと、中の読めないページ。stageEntry は、ブックの外のバインダか（true なら、ステージエントリが持つ設定の項目の値を受ける。
// ブックの中のバインダは、機能台帳に在る設定の項目の値を持てば形に合わない）
type BinderRead = { code: UnreadableCode; type?: string } | { binder: BinderEntry; inner: Lost[] }
function judgeBinder(catalog: CoreCatalog, raw: Readonly<Record<string, unknown>>, stageEntry = false): BinderRead {
  const pages = Array.isArray(raw.lineup) ? (raw.lineup as unknown[]) : undefined
  const { kind: _, ...fields } = raw
  const refs = pages?.map(p => (isRecord(p) && typeof p.id === "string" ? { kind: "page", id: p.id } : p))
  const row = binderFolderOf({ ...fields, folderRole: "binder", lineup: refs })
  if (!row || !pages?.every(isRecord)) return { code: "W028" }
  const shape = stageEntry ? catalog.outermostSettingsSchema : catalog.innerBinderSettingsSchema
  const settings = shape.safeParse(row.settings)
  if (!settings.success) return { code: "W028" }
  if (!catalog.pageTypes.has(row.pageType)) return { code: "W027", type: row.pageType }
  const inner: Lost[] = []
  const kept: AnyPage[] = []
  for (const p of pages) {
    const read = judgePage(catalog, p)
    if (typeof read !== "string") kept.push(read)
    else
      inner.push({
        kind: "page",
        id: p.id as string,
        holder: row.id,
        code: read,
        ...(read === "W027" ? typeIn(p, "type") : {}),
      })
  }
  const binder: BinderEntry = {
    kind: "binder",
    id: row.id,
    title: row.title,
    pageType: row.pageType,
    lineup: kept,
    ...(row.settings ? { settings: settings.data as OutermostSettings } : {}),
  }
  return binderHolds(catalog, binder) ? { binder, inner } : { code: "W029" }
}

// ブックの外（書庫ホーム・ゴミ箱・フォルダの直下）のページ 1 枚 raw を読んだページか、読めない訳の番号: ブックの外のページ 1 枚の形で読む judgePage に、まとまるタイプ（grouping が binder）のページはバインダの外に置かない決まりを足した物（破れば W029）
function judgeOutsidePage(catalog: CoreCatalog, raw: Readonly<Record<string, unknown>>): AnyPage | UnreadableCode {
  const read = judgePage(catalog, raw, true)
  return typeof read === "string" || pageHoldsOutside(catalog, read) ? read : "W029"
}

// ブックの外のバインダ 1 つ raw を読んだ物: judgeBinder に、空でない決まり（binderHoldsOutside）を足した物。空なら W029、中のページが 1 枚も読めなければ、最初のページの訳でバインダごと読めない
function judgeOutsideBinder(catalog: CoreCatalog, raw: Readonly<Record<string, unknown>>): BinderRead {
  const read = judgeBinder(catalog, raw, true)
  if ("code" in read || binderHoldsOutside(catalog, read.binder)) return read
  const [first] = read.inner
  if (!first) return { code: "W029" }
  return { code: first.code, ...(first.type === undefined ? {} : { type: first.type }) }
}

// 残したブック 1 冊 raw（並びにページとバインダの中身ごと持つ形。形を確かめる前）を今の機能台帳で読んだ物。読めるかの判定は、画面もホストもこれ 1 つで決める。
// ブックごと読めなければ、その訳: 読めない物を除いてもブックの形に合わない・行の無い物を指したまま組まれている W005／並びの決まりを守らない W006。
// 読めれば、読めない物を除いたブックと、中の読めない物（ページ・バインダ。外側の 1 つだけ。バインダごと読めないバインダの中のページは数えない）
// 同じ値は覚えておき、確かめ直さない（窓は知らせを受けるたびに書庫を読み直すが、変わらないブックの行は同じ値のまま）
export type BookRead = { code: MovedCode } | { book: Book; inner: readonly Lost[] }
const bookChecks = new WeakMap<CoreCatalog, WeakMap<object, BookRead>>()
export function judgeBook(catalog: CoreCatalog, raw: unknown): BookRead {
  if (typeof raw !== "object" || raw === null) return readBook(catalog, raw)
  const kept = keptFor(bookChecks, catalog)
  const hit = kept.get(raw)
  if (hit) return hit
  const made = readBook(catalog, raw)
  kept.set(raw, made)
  return made
}

function readBook(catalog: CoreCatalog, raw: unknown): BookRead {
  // 読めない物の無いブックは、ブックの形で 1 回確かめるだけで済ませる（ページごとには確かめ直さない）
  const whole = wholeBook(catalog, raw)
  if (whole && lineupHolds(catalog, whole)) return { book: whole, inner: [] }
  if (!isRecord(raw) || !Array.isArray(raw.lineup)) return { code: "W005" }
  const entries = raw.lineup as unknown[]
  const missing = (e: unknown) =>
    idOnly(e) || (isRecord(e) && e.kind === "binder" && Array.isArray(e.lineup) && e.lineup.some(idOnly))
  if (entries.some(missing)) return { code: "W005" }
  const holder = typeof raw.id === "string" ? raw.id : ""
  const inner: Lost[] = []
  const lineup: unknown[] = []
  for (const e of entries) {
    if (isRecord(e) && e.kind === "page" && typeof e.id === "string") {
      const read = judgePage(catalog, e)
      if (typeof read !== "string") lineup.push(e)
      else inner.push({ kind: "page", id: e.id, holder, code: read, ...(read === "W027" ? typeIn(e, "type") : {}) })
    } else if (isRecord(e) && e.kind === "binder" && typeof e.id === "string") {
      const read = judgeBinder(catalog, e)
      if ("code" in read) inner.push({ kind: "binder", id: e.id, holder, ...read })
      else {
        inner.push(...read.inner)
        const kept = new Set(read.binder.lineup.map(p => p.id))
        lineup.push({ ...e, lineup: (e.lineup as unknown[]).filter(p => isRecord(p) && kept.has(p.id as string)) })
      }
    } else lineup.push(e)
  }
  const parsed = catalog.bookSchema.safeParse({ ...raw, lineup })
  if (!parsed.success) return { code: "W005" }
  const book = parsed.data as Book
  return lineupHolds(catalog, book) ? { book, inner } : { code: "W006" }
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

// 機能台帳に無い物の id missing の warning W007（無ければ空。最初の物の持ち主のプラグインの warning）。params（ブックかブックの外のページの id と名前）を添える
function missingWarnings(missing: readonly string[], params: Readonly<Record<string, string>>): Warning[] {
  const [first] = missing
  return first ? [warning("W007", splitId(first).owner ?? "", { ...params, missing: missing.join(", ") })] : []
}

// ブックの外のページ saved（置き場所から読んだまま）のうち、読めるが、機能台帳に無いアイテムや設定の項目を持つページの warning W007（ページごとに 1 つ。読めないページには出さない）。
// 置き場所を受けないので、ブックの外のページ 1 枚の形で読む（ブックの外のバインダの中のページが置き場所に合わない値を持つかは、書庫を読む所 readLibrary が決める）
export function checkOutsidePages(catalog: CoreCatalog, saved: readonly unknown[]): Warning[] {
  return saved.flatMap(p => {
    const page =
      typeof p === "object" && p !== null ? (readablePage(catalog, p, true) as ItemPage | undefined) : undefined
    if (!page) return []
    const params = { kind: "page", id: page.id, title: page.title }
    return missingWarnings(missingIn(catalog, [], [page]), params)
  })
}

// 残しておいたブックのうち、読めるものだけ（checkBooks の books）
export const restoreBooks = (catalog: CoreCatalog, saved: readonly unknown[]): Book[] =>
  checkBooks(catalog, saved).books

// 置き場所から読んだままの行を、今の機能台帳で読んだ書庫。library は書庫の表、books・warnings・partial は checkBooks と同じ（読めるブック・読めないブック・読めるブックの中の問題）
export interface LibraryRead {
  library: Library
  books: readonly Book[]
  warnings: readonly Warning[]
  partial: readonly Warning[]
}

// 置き場所から読んだままのページの行 pageRows とフォルダの行 folderRows を、今の機能台帳で読んだ書庫の表と問題。
// 表に入るのは、読めるブック（checkBooks。ブックの中の読み方も同じ）を分けた行と、形に合う書庫ホーム・ゴミ箱・フォルダと、それらが直に持つブックの外のページとブックの外のバインダ。
// ブックの外のページは、そのタイプのページの形で読め、まとまるタイプでないときだけ入れる（読めなければ入れず、残したデータには手を付けない）。
// ブックの外のバインダは、形に合い、中のページの行が全部在って読め、バインダの決まりを守り、空でないときだけ、中のページごと入れる。
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
  if (open.length === 0) return { library: tables, ...checked }
  const pages: Record<string, PageRow> = { ...tables.pages }
  const folders: Record<string, Folder> = { ...tables.folders }
  for (const f of open) folders[f.id] = f
  const pageRow = rowsById(pageRows)
  const folderRow = rowsById(folderRows)
  for (const f of open)
    for (const r of f.lineup) {
      if (r.kind === "page") {
        // 行が無い・もう表に在る物は読まない（2 度持たれた物と行の無い物は、木の決まりが見る）
        const raw = pageRow.get(r.id)
        if (!raw || Object.hasOwn(pages, r.id)) continue
        const page = judgeOutsidePage(catalog, raw)
        if (typeof page !== "string") pages[r.id] = page as PageRow
      }
      if (r.kind !== "binder" || Object.hasOwn(folders, r.id)) continue
      const row = folderRow.get(r.id)
      if (row?.folderRole !== "binder") continue
      const inside = (Array.isArray(row.lineup) ? (row.lineup as unknown[]) : []).map(p =>
        isRecord(p) && typeof p.id === "string" ? pageRow.get(p.id) : undefined,
      )
      if (inside.some(p => p === undefined || Object.hasOwn(pages, p.id as string))) continue
      const { folderRole: _, ...fields } = row
      const binder = judgeOutsideBinder(catalog, { ...fields, kind: "binder", lineup: inside })
      if ("code" in binder || binder.inner.length > 0) continue
      folders[r.id] = binderFolderOf(row) as Folder
      for (const p of binder.binder.lineup) pages[p.id] = p as PageRow
    }
  return { library: { pages, folders }, ...checked }
}

// ブックの並び（ページタブの順。1 つはページか、1 つのタイプのページだけを入れるバインダ）
export const lineupOf = (book: StageLineup): readonly LineupEntry[] => book.lineup

// このブックが持つページを、並びの順に（バインダの中のページも、バインダの所に続けて）
export const pagesOf = (book: StageLineup): readonly ItemPage[] =>
  book.lineup.flatMap((e): readonly ItemPage[] => (e.kind === "page" ? [e] : e.lineup))

// ブックのバインダを、並びの順に
export const bindersOf = (book: StageLineup): readonly BinderEntry[] =>
  book.lineup.flatMap(e => (e.kind === "binder" ? [e] : []))

// ページがバインダに入っていないときの値（findPage の binder・binderOf）
export const NO_BINDER = "none"

// ページが無いときの値（開いているページが無い・ページを開いていない・id のページが無い）
export const NO_PAGE = "none"
// アイテムが無いときの値（ページに id のアイテムが無い）
export const NO_ITEM = "none"

// id のページと、それが入っているバインダ（並びに直に入っているページは binder が NO_BINDER。無ければ NO_PAGE）
export function findPage(
  book: StageLineup,
  id: string,
): { page: ItemPage; binder: BinderEntry | typeof NO_BINDER } | typeof NO_PAGE {
  for (const e of book.lineup) {
    if (e.kind === "page") {
      if (e.id === id) return { page: e, binder: NO_BINDER }
    } else if (e.kind === "binder") {
      const found = e.lineup.find(p => p.id === id)
      if (found) return { page: found, binder: e }
    }
  }
  return NO_PAGE
}

// findPage が見つけたページ（NO_PAGE なら undefined）。core の中の、無いを undefined で受ける関数に渡すときに使う（プラグイン API には出さない）
export const foundPage = (found: ReturnType<typeof findPage>): ItemPage | undefined =>
  found === NO_PAGE ? undefined : found.page

// id の要素（ページかバインダ）と同じブックかバインダの並び: 並びに直に入っている要素ならブックの並び、バインダの中のページならそのバインダの並び（無ければ undefined）
export function siblingsOf(book: StageLineup, id: string): readonly LineupEntry[] | undefined {
  if (book.lineup.some(e => e.id === id)) return book.lineup
  return bindersOf(book).find(f => f.lineup.some(p => p.id === id))?.lineup
}

// バインダ binder の中のページを、並びの順に（バインダが無ければ空）
export const pagesIn = (book: StageLineup, binder: string): readonly ItemPage[] =>
  findBinder(book, binder)?.lineup ?? []

export const findBinder = (book: StageLineup, id: string): BinderEntry | undefined =>
  bindersOf(book).find(f => f.id === id)

// 並びのページを 1 枚ずつ f で替える（バインダの中も。f が undefined を返したページは除く）
function mapPages<B extends StageLineup>(book: B, f: (page: AnyPage) => AnyPage | undefined): B {
  const lineup = book.lineup.flatMap((e): LineupEntry[] => {
    if (e.kind === "page") return [f(e)].flatMap(x => x ?? [])
    const inner = e.lineup.flatMap((p): AnyPage[] => [f(p)].flatMap(x => x ?? []))
    return [{ ...e, lineup: inner }]
  })
  return { ...book, lineup }
}

// ページをエントリにする。page に置いたアイテムがページのタイプの選んだものかは型では確かめられないので、ページの型だと言い張る
// （形は perform がアクションの後に機能台帳のブックの形で確かめ直す）
const entryOf = (page: ItemPage): AnyPage => page as AnyPage

// ブック book の、同じ id のページを page に替える（場所は変えない。無ければ何も変えない）
export function putPage<B extends StageLineup>(book: B, page: ItemPage): B {
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
export function addPage<B extends StageLineup>(
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
export function removePage<B extends StageLineup>(book: B, page: string): B {
  return mapPages(book, e => (e.id === page ? undefined : e))
}

// エントリ（ページかバインダ）を、同じ並びかバインダの中の index 番目（動かす物を除いて数える）へ動かす（並びに直に入っている物は並びの中、バインダの中のページはそのバインダの中。
// index が後ろすぎれば末尾。id が無いか、動かしても同じ場所なら何も変えない）
export function moveEntry<B extends StageLineup>(book: B, id: string, index: number): B {
  const moved = <E extends { id: string }>(list: readonly E[]): readonly E[] => {
    const from = list.findIndex(e => e.id === id)
    const at = Math.min(index, list.length - 1)
    const entry = list[from]
    if (!entry || from === at) return list
    const others = list.filter(e => e.id !== id)
    return [...others.slice(0, at), entry, ...others.slice(at)]
  }
  const top = moved(book.lineup)
  if (top !== book.lineup) return { ...book, lineup: top }
  // 並びに直に在る物は、動かなくてもバインダの中を探さない（バインダの id と同じ id の並びも在る）
  if (book.lineup.some(e => e.id === id)) return book
  const lineup = book.lineup.map(e => {
    if (e.kind !== "binder") return e
    const inside = moved(e.lineup)
    return inside === e.lineup ? e : { ...e, lineup: inside }
  })
  return lineup.every((e, i) => e === book.lineup[i]) ? book : { ...book, lineup }
}

// 空のバインダ binder（id を持たない）を並びの index 番目（省けば末尾）に足したブックと、振ったバインダの id（newId の値そのまま。ブックのほかの id と重ならない）
export function addBinder<B extends StageLineup>(
  book: B,
  binder: NewBinder,
  index: number | undefined,
  newId: () => string,
): { book: B; binder: string } {
  const made: BinderEntry = { ...binder, kind: "binder", id: freshPageId(newId, lineupIds(book)), lineup: [] }
  return { book: { ...book, lineup: insertAt<LineupEntry>(book.lineup, made, index) }, binder: made.id }
}

// ページを id だけにしたブック: ブックとバインダのフィールドはそのままで、ページを id だけにした値（ブックそのものとバインダだけを、中のページの中身と分けて比べるのに使う）
export function frameOf(book: Book): unknown {
  const stub = ({ id }: { id: string }) => ({ id })
  return {
    ...book,
    lineup: book.lineup.map(e => (e.kind === "binder" ? { ...e, lineup: e.lineup.map(stub) } : stub(e))),
  }
}

// id のバインダを、f の返すバインダに替える（場所は変えない）
export function putBinder<B extends StageLineup>(book: B, id: string, f: (binder: BinderEntry) => BinderEntry): B {
  return { ...book, lineup: book.lineup.map(e => (e.kind === "binder" && e.id === id ? f(e) : e)) }
}

// id のバインダを、中のページごと除く
export function removeBinder<B extends StageLineup>(book: B, id: string): B {
  return { ...book, lineup: book.lineup.filter(e => !(e.kind === "binder" && e.id === id)) }
}

// ブックの中の id（ページとバインダ）。新しい id を振るときに、重ならないようにする相手
const lineupIds = (book: StageLineup): string[] => [...pagesOf(book).map(p => p.id), ...bindersOf(book).map(f => f.id)]

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

// 名前の重なりの無い並びか（名前の無い物は数えない）
function distinctTitles(entries: readonly { title: string }[]): boolean {
  const titles = entries.map(e => e.title).filter(t => t !== "")
  return new Set(titles).size === titles.length
}

// バインダの決まり（ブックの中でも外でも同じ）を守っているか: 中の名前は重ならない／中のページは、入れるタイプのページ／入れるタイプは、まとまるタイプ
// ／中のページは、紙と向きが同じ
function binderHolds(catalog: CoreCatalog, binder: BinderEntry): boolean {
  return distinctTitles(binder.lineup) && typesAndPaperHold(catalog, binder)
}

// バインダの決まりのうち、名前に依らない物を守っているか: 入れるタイプは、まとまるタイプ／中のページは、入れるタイプのページ／中のページは、紙と向きが同じ
function typesAndPaperHold(catalog: CoreCatalog, binder: Pick<BinderEntry, "pageType" | "lineup">): boolean {
  if (binder.lineup.some(p => p.type !== binder.pageType)) return false
  if (catalog.pageTypes.get(binder.pageType)?.grouping !== "binder") return false
  return sharesPaper(binder)
}

// 書庫 library のバインダ binder が、ページ page を入れられるか（バインダの決まりのうち名前に依らない物 typesAndPaperHold を、
// page を入れた並びが守るか。中に page が在れば、それを除いて比べる。名前の重なりは見ない）。binder がバインダでなければ false
export function binderTakes(catalog: CoreCatalog, { pages, folders }: Library, binder: string, page: AnyPage): boolean {
  const to = folders[binder]
  if (to?.folderRole !== "binder") return false
  const lineup = [...to.lineup.flatMap(r => (r.id === page.id ? [] : (pages[r.id] ?? []))), page]
  return typesAndPaperHold(catalog, { pageType: to.pageType, lineup })
}

// 書庫のバインダ binder が空か（中に 1 枚も無い。バインダでなければ false）
export const binderIsEmpty = (folders: Library["folders"], binder: string): boolean =>
  folders[binder]?.folderRole === "binder" && folders[binder].lineup.length === 0

// ブックの外（書庫ホーム・ゴミ箱・フォルダの直下）に、バインダに入らずに置けるページか: まとまるタイプ（grouping が binder）でない
export const pageHoldsOutside = (catalog: CoreCatalog, page: Pick<AnyPage, "type">): boolean =>
  catalog.pageTypes.get(page.type)?.grouping !== "binder"

// ブックの外のバインダの決まりを守っているか: バインダの決まり（binderHolds）を守り、空でない
export const binderHoldsOutside = (catalog: CoreCatalog, binder: BinderEntry): boolean =>
  binder.lineup.length > 0 && binderHolds(catalog, binder)

// 書庫 next のうち、書庫 was から変わったフォルダとページの行に関わる所が、ブックの外（書庫ホーム・ゴミ箱・フォルダの直下。ゴミ箱の中も）の決まりを守っているか:
// 直下のページは pageHoldsOutside を、直下のバインダは binderHoldsOutside を守り、バインダの設定の項目の値は機能台帳の形に合う（読む側の readLibrary・unreadableUnitsOf と同じ決まり）
export function outsideHolds(catalog: CoreCatalog, was: Library, next: Library): boolean {
  const { pages, folders } = next
  const outside = (id: string) => isOpenRole(folders[id]?.folderRole)
  const looseOk = (id: string): boolean => {
    const page = pages[id]
    return page === undefined || pageHoldsOutside(catalog, page)
  }
  const binderOk = (id: string): boolean => {
    const row = folders[id]
    if (row?.folderRole !== "binder") return true
    const lineup = row.lineup.map(r => pages[r.id])
    if (lineup.some(p => p === undefined)) return false
    const { title, pageType } = row
    if (row.settings !== undefined && !catalog.outermostSettingsSchema.safeParse(row.settings).success) return false
    return binderHoldsOutside(catalog, { kind: "binder", id, title, pageType, lineup: lineup as AnyPage[] })
  }
  for (const f of Object.values(folders)) {
    if (was.folders[f.id] === f) continue
    if (f.folderRole === "binder") {
      const holder = placeOf(folders, f.id)?.holder.id
      if (holder !== undefined && outside(holder) && !binderOk(f.id)) return false
      continue
    }
    if (!outside(f.id)) continue
    for (const r of f.lineup) {
      if (r.kind === "page" && !looseOk(r.id)) return false
      if (r.kind === "binder" && !binderOk(r.id)) return false
    }
  }
  for (const [id, page] of Object.entries(pages)) {
    if (was.pages[id] === page) continue
    const holder = placeOf(folders, id)?.holder
    if (holder?.folderRole === "binder") {
      const over = placeOf(folders, holder.id)?.holder.id
      if (over !== undefined && outside(over) && !binderOk(holder.id)) return false
    } else if (holder !== undefined && outside(holder.id) && !looseOk(id)) return false
  }
  return true
}

// バインダの中のページが、紙と向きをそろえているか
function sharesPaper(binder: Pick<BinderEntry, "lineup">): boolean {
  const pages = binder.lineup
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

// 書庫を was から next に変えた前と後で、同じ id のページのタイプと、同じ id のバインダが入れるタイプが同じか
// （ブックの中・外・ゴミ箱のどこに在っても、その間を動いても）
export function keepsTypesIn(was: Library, next: Library): boolean {
  const pagesKept = Object.entries(next.pages).every(([id, page]) => {
    const before = was.pages[id]
    return before === undefined || before.type === page.type
  })
  return (
    pagesKept &&
    Object.values(next.folders).every(f => {
      const before = was.folders[f.id]
      return f.folderRole !== "binder" || before?.folderRole !== "binder" || before.pageType === f.pageType
    })
  )
}

// ページの id から、そのページと、今それを持っているブック（ページの id はブックをまたいでも重ならない。同じ id のページが 2 冊にあれば、どちらとも決めずに無いとする）
export function pageById(
  books: Readonly<Record<string, Book>>,
  id: string,
): { book: Book; page: ItemPage; binder: BinderEntry | typeof NO_BINDER } | undefined {
  let found: { book: Book; page: ItemPage; binder: BinderEntry | typeof NO_BINDER } | undefined
  for (const book of Object.values(books)) {
    const at = findPage(book, id)
    if (at === NO_PAGE) continue
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
// 読めるかは judgeBook・judgeBinder の判定（checkBooks と同じ）で、外側の物を 1 つだけ数える: ブックの外のページとバインダはそれぞれ、
// ブックは、ブックごと読めなければブックごと（中の物は数えない）、読めればその中の読めない物を。先に数えたブック（フォルダの行の順）と id が重なるブックは、ブックごと（W006）。
// 木の決まりを破る物（行の無いエントリ・種類と役の合わないエントリ・どこにも持たれていない行）と、読めない物のフォルダの中の物は数えない
export function unreadableUnitsOf(
  catalog: CoreCatalog,
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
): UnreadableUnit[] {
  const page = rowsById(pageRows)
  const folder = rowsById(folderRows)
  const raws = rowsById(rawBooksOf(pageRows, folderRows))
  const order = new Map([...folder.keys()].map((id, i) => [id, i]))
  const units: UnreadableUnit[] = []
  const passed = new Set<string>()
  const books: { book: Book; unit: UnreadableUnit; inner: UnreadableUnit[]; at: number }[] = []
  const unitOf = (l: Lost): UnreadableUnit => ({
    element: l.kind === "page" ? { kind: "page", id: l.id } : { kind: "binder", id: l.id },
    holder: l.holder,
    code: l.code,
    ...(l.type === undefined ? {} : { type: l.type }),
  })
  const refsIn = (row: Readonly<Record<string, unknown>> | undefined): unknown[] =>
    Array.isArray(row?.lineup) ? (row.lineup as unknown[]) : []
  // 並び lineup が指すページとバインダ（その中のページも）の行が、全部在るか
  const rowsThere = (lineup: readonly unknown[]): boolean =>
    lineup.every(e => {
      const r = refOf(e, true)
      if (r?.kind === "page") return page.has(r.id)
      if (r?.kind !== "binder") return true
      const binder = folder.get(r.id)
      return (
        binder?.folderRole === "binder" && refsIn(binder).every(p => !idOnly(p) || page.has((p as { id: string }).id))
      )
    })
  // 行のバインダ row を、中のページを中身にした並びのエントリの形にした物
  const binderOf = (row: Readonly<Record<string, unknown>>) => {
    const { folderRole: _, ...fields } = row
    return {
      ...fields,
      kind: "binder",
      lineup: refsIn(row).map(p => (idOnly(p) ? (page.get((p as { id: string }).id) ?? p) : p)),
    }
  }
  const visit = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    const row = folder.get(id)
    if (!row || !namesHomeOrFolder(row) || !Array.isArray(row.lineup)) return
    for (const e of row.lineup as unknown[]) {
      const r = refOf(e, true)
      if (!r) continue
      const element = e as AnyEntryRef | TrashRef
      if (r.kind === "folder") visit(r.id)
      else if (!rowsThere([{ kind: r.kind, id: r.id }])) continue
      else if (r.kind === "page") {
        const raw = page.get(r.id) as Readonly<Record<string, unknown>>
        const read = judgeOutsidePage(catalog, raw)
        if (typeof read === "string")
          units.push({ element, holder: id, code: read, ...(read === "W027" ? typeIn(raw, "type") : {}) })
      } else if (r.kind === "binder") {
        const read = judgeOutsideBinder(catalog, binderOf(folder.get(r.id) as Readonly<Record<string, unknown>>))
        if ("code" in read) units.push({ element, holder: id, ...read })
        else units.push(...read.inner.map(unitOf))
      } else {
        const book = folder.get(r.id)
        if (!book || !isBookRole(book.folderRole)) continue
        if (!rowsThere(refsIn(book))) continue
        const read = judgeBook(catalog, raws.get(r.id))
        if (!("book" in read)) units.push({ element, holder: id, code: read.code })
        else
          books.push({
            book: read.book,
            unit: { element, holder: id, code: "W006" },
            inner: read.inner.map(unitOf),
            at: order.get(r.id) ?? 0,
          })
      }
    }
  }
  for (const id of libraryTopIdsIn(folder)) visit(id)
  // id の重なりは、checkBooks と同じに、フォルダの行の順で先のブックを残す
  books.sort((a, b) => a.at - b.at)
  const distinct = new Set(distinctBooks(books.map(b => b.book)).books)
  for (const b of books) {
    if (distinct.has(b.book)) units.push(...b.inner)
    else units.push(b.unit)
  }
  // 2 度持たれた物は、木の決まりを破る物なので数えない
  const held = new Map<string, number>()
  for (const f of folder.values())
    for (const e of refsIn(f)) {
      const r = refOf(e, true)
      if (r) held.set(r.id, (held.get(r.id) ?? 0) + 1)
    }
  return units.filter(u => held.get(u.element.id) === 1)
}

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
