// ページとフォルダの表: 世界と保存の単位。ページは 1 枚ずつ、フォルダは 1 つずつ持ち、フォルダが中身（エントリ）の id を順に持つ（ページは、自分の入っているフォルダを持たない）。
// フォルダは、書庫ホーム（folderRole が "home"）か、ゴミ箱（"trash"）か、フォルダ（"folder"）か、ブック（"book"。エントリはページとバインダ）か、
// バインダ（"binder"。1 つのタイプのページだけ）。書庫ホームとゴミ箱は、ただ 1 つずつで、どのフォルダにも入らない。そのほかのページとフォルダは、ちょうど 1 つのフォルダに入る。

import { z } from "zod"
import type { ItemPage } from "./placed"
import type { REMOVED } from "./records"
import type { AnyPage, Book } from "./schema/book"
import type { WarningCode } from "./warnings"

// フォルダが持つエントリ 1 つ: ページかバインダの id
export interface PageRef {
  kind: "page"
  id: string
}
export interface BinderRef {
  kind: "binder"
  id: string
}
export type EntryRef = PageRef | BinderRef
export interface BookRef {
  kind: "book"
  id: string
}
export interface FolderRef {
  kind: "folder"
  id: string
}
// 書庫ホーム・ゴミ箱・フォルダが持つエントリ 1 つ: ページ・バインダ・ブック・フォルダのどれかの id
export type AnyEntryRef = EntryRef | BookRef | FolderRef

// 書庫ホームの id（決まった値。書庫ホームは、この id のフォルダただ 1 つ）
export const HOME_ID = "library-home"
// ゴミ箱の id（決まった値。ゴミ箱は、この id のフォルダただ 1 つ）
export const TRASH_ID = "library-trash"
// ゴミ箱の並びのエントリ 1 つ: 入れた物の id と、入れた時刻 trashed と、元いたフォルダから上への id の列 from（近い順。戻す先を決めるのに使う）
export type TrashRef = AnyEntryRef & { trashed: string; from: readonly string[] }

// ブックのフォルダ: ブックのフィールド（名前・ロック・ブックが持つ設定の項目）と、エントリの id の並び
export type BookFolder = Omit<Book, "lineup"> & { folderRole: "book"; lineup: readonly EntryRef[] }
// バインダ: 名前と、入れるページのタイプと、ページの id の並び
export interface BinderFolder {
  folderRole: "binder"
  id: string
  title: string
  pageType: string
  lineup: readonly PageRef[]
}
// 書庫ホーム: 書庫の一番上のフォルダ。名前は持たない
export interface HomeFolder {
  folderRole: "home"
  id: typeof HOME_ID
  lineup: readonly AnyEntryRef[]
}
// フォルダ（ブックでもバインダでもない物）: 名前と、エントリの id の並び。システムフォルダ（core/def/system-folder.ts）は、名前の代わりに
// 印 systemFolder（システムフォルダの定義の id）を持つ（名前は定義から引く。core/entries.ts の rowTitle）
export type PlainFolder = {
  folderRole: "folder"
  id: string
  lineup: readonly AnyEntryRef[]
} & ({ title: string; systemFolder?: never } | { systemFolder: string; title?: never })
// ゴミ箱: 書庫ホームと並ぶ、書庫の一番上のフォルダ。名前は持たない
export interface TrashFolder {
  folderRole: "trash"
  id: typeof TRASH_ID
  lineup: readonly TrashRef[]
}
// 読めない物のフォルダの id（決まった値。読めない物のフォルダは、この id のフォルダただ 1 つ）
export const UNREADABLE_ID = "library-unreadable"
// 読めない物が移った理由の warning の番号: 形が合わない W005・決まりを守らない W006（ブックとバインダ）、タイプが機能台帳に無い W027・タイプの形に合わない W028・
// タイプの決まりを守らない W029（ページとバインダ）
export const MOVED_CODES = ["W005", "W006", "W027", "W028", "W029"] as const satisfies readonly WarningCode[]
export type MovedCode = (typeof MOVED_CODES)[number]
// 読めない物のフォルダの並びのエントリ 1 つ: 在った所の並びのエントリそのまま entry（ゴミ箱に居た物なら TrashRef のまま）と、在ったフォルダから上への id の列 from（近い順）と、
// 在った所で直前に並んでいた物の id after（先頭なら "none"）と、理由の番号 code と、機能台帳に無いタイプの id type（W027 で、行が文字列で持つときだけ）と、移した時刻 moved
export interface UnreadableRef {
  entry: AnyEntryRef | TrashRef
  from: readonly string[]
  after: string
  code: MovedCode
  type?: string
  moved: string
}
// 在った所で先頭に並んでいた物の after
export const FIRST = "none"
// 読めない物のフォルダ: 書庫の一番上のフォルダ（どのフォルダにも入らず、物を入れる所にはならない）。名前は持たない。中の物どうしは、名前が重なってよい
export interface UnreadableFolder {
  folderRole: "unreadable"
  id: typeof UNREADABLE_ID
  lineup: readonly UnreadableRef[]
}
// 読めない物のフォルダの役か
export const isUnreadableRole = (role: unknown): role is "unreadable" => role === "unreadable"

// 書庫ホームかゴミ箱かフォルダ（ブックを組む値には入らず、表にだけ在る）
export type HomeOrFolder = HomeFolder | TrashFolder | PlainFolder
export type Folder = BookFolder | BinderFolder | HomeOrFolder

// 書庫の一番上のフォルダ（どのフォルダにも入らず、ただ 1 つずつ在る）の表: 役ごとの、決まった id と、
// open（ページ・バインダ・ブック・フォルダの 4 つとも持てるか）と library（中の物が書庫 Library に入るか）。
// 一番上の役を見る所は、役の名前を並べずにこの表から引く（Go の internal/storage/library.go の topFolders と同じ表）
export const TOP_FOLDERS = {
  home: { id: HOME_ID, open: true, library: true },
  trash: { id: TRASH_ID, open: true, library: true },
  unreadable: { id: UNREADABLE_ID, open: false, library: false },
} as const satisfies Readonly<Record<string, { id: string; open: boolean; library: boolean }>>
export type TopRole = keyof typeof TOP_FOLDERS
const topRoles = Object.keys(TOP_FOLDERS) as TopRole[]
// 一番上のフォルダの id の全部（表の順）
export const TOP_IDS: readonly string[] = topRoles.map(r => TOP_FOLDERS[r].id)
// 中の物が書庫に入る一番上のフォルダの id（表の順。書庫ホームが先）
export const LIBRARY_TOP_IDS: readonly string[] = topRoles
  .filter(r => TOP_FOLDERS[r].library)
  .map(r => TOP_FOLDERS[r].id)

// 書庫の一番上のフォルダの役か
export const isTopRole = (role: unknown): role is TopRole =>
  typeof role === "string" && Object.hasOwn(TOP_FOLDERS, role)
// ページ・バインダ・ブック・フォルダの 4 つとも持てる役か: 4 つとも持てる一番上の役（書庫ホーム・ゴミ箱）とフォルダ（ブックにもバインダにもならない役）
export const isOpenRole = (role: unknown): role is HomeOrFolder["folderRole"] =>
  (isTopRole(role) && TOP_FOLDERS[role].open) || role === "folder"
// ブックの役か: 一番上の役でも、4 つとも持てる役でも、バインダでもない（形の合わない役もブックとして読み、読めないブックになる）
export const isBookRole = (role: unknown): boolean => !isTopRole(role) && !isOpenRole(role) && role !== "binder"

const AnyEntryRefSchema = z.strictObject({ kind: z.enum(["page", "binder", "book", "folder"]), id: z.string().min(1) })
const TrashRefSchema = AnyEntryRefSchema.extend({ trashed: z.string().min(1), from: z.array(z.string().min(1)) })
// 読めない物のフォルダの並びの要素の形
export const UnreadableRefSchema = z.strictObject({
  entry: z.union([TrashRefSchema, AnyEntryRefSchema]),
  from: z.array(z.string().min(1)),
  after: z.string().min(1),
  code: z.enum(MOVED_CODES),
  type: z.string().min(1).optional(),
  moved: z.string().min(1),
})
// 読めない物のフォルダの行の形
const UnreadableFolderSchema = z.strictObject({
  folderRole: z.literal("unreadable"),
  id: z.literal(UNREADABLE_ID),
  lineup: z.array(UnreadableRefSchema),
})
// 読めない物のフォルダの行が形に合わない（中の物を戻せず、上書きもしない）
export const BROKEN = "broken"
// 置き場所から読んだままのフォルダの行 folders のうちの、読めない物のフォルダ（行が無ければ、中に何も無い物。形に合わなければ BROKEN）
export function unreadableFolderOf(folders: readonly unknown[]): UnreadableFolder | typeof BROKEN {
  const row = folders.find(f => isUnreadableRole((f as { folderRole?: unknown } | null)?.folderRole))
  if (row === undefined) return { folderRole: "unreadable", id: UNREADABLE_ID, lineup: [] }
  const parsed = UnreadableFolderSchema.safeParse(row)
  return parsed.success ? (parsed.data as UnreadableFolder) : BROKEN
}
const HomeOrFolderSchema = z.union([
  z.strictObject({ folderRole: z.literal("home"), id: z.literal(HOME_ID), lineup: z.array(AnyEntryRefSchema) }),
  z.strictObject({ folderRole: z.literal("trash"), id: z.literal(TRASH_ID), lineup: z.array(TrashRefSchema) }),
  // フォルダは名前を持ち、システムフォルダは名前の代わりに印を持つ（両方は持たない）
  z.strictObject({
    folderRole: z.literal("folder"),
    id: z.string().min(1),
    title: z.string().min(1),
    lineup: z.array(AnyEntryRefSchema),
  }),
  z.strictObject({
    folderRole: z.literal("folder"),
    id: z.string().min(1),
    systemFolder: z.string().min(1),
    lineup: z.array(AnyEntryRefSchema),
  }),
])

// 書庫ホーム・ゴミ箱・フォルダの行 row が、形に合うか
export const homeOrFolderHolds = (row: unknown): boolean => HomeOrFolderSchema.safeParse(row).success

// フォルダの行が書庫ホーム・ゴミ箱・フォルダの役を名乗るか（形は確かめない）
export const namesHomeOrFolder = (row: unknown): boolean =>
  typeof row === "object" && row !== null && isOpenRole((row as { folderRole?: unknown }).folderRole)

// 置き場所から読んだままのフォルダ folders のうち、書庫ホーム・ゴミ箱・フォルダ（形に合う物だけ。合わない物は入らず、木の決まり treeHolds が破れて見える）
export function homeAndFoldersOf(folders: readonly unknown[]): HomeOrFolder[] {
  return folders.flatMap(f => {
    const parsed = namesHomeOrFolder(f) ? HomeOrFolderSchema.safeParse(f) : undefined
    return parsed?.success ? [parsed.data as HomeOrFolder] : []
  })
}

// バインダの行の形（ブックの中でも外でも同じ: 名前・入れるページのタイプ・ページの id の並び）
const BinderFolderSchema = z.strictObject({
  folderRole: z.literal("binder"),
  id: z.string().min(1),
  title: z.string().min(1),
  pageType: z.string().min(1),
  lineup: z.array(z.strictObject({ kind: z.literal("page"), id: z.string().min(1) })),
})

// 置き場所から読んだままのフォルダの行 row が、バインダの形に合えばそのバインダ（合わなければ undefined）
export function binderFolderOf(row: unknown): BinderFolder | undefined {
  if (typeof row !== "object" || row === null || (row as { folderRole?: unknown }).folderRole !== "binder")
    return undefined
  const parsed = BinderFolderSchema.safeParse(row)
  return parsed.success ? (parsed.data as BinderFolder) : undefined
}

// ブック books だけを直下に持つ書庫ホーム（ブックの並びから世界を作るときの、置き場所）
export const homeOver = (books: readonly { id: string }[]): HomeFolder => ({
  folderRole: "home",
  id: HOME_ID,
  lineup: books.map(b => ({ kind: "book", id: b.id })),
})

// ページの表の 1 行（今の機能台帳で読めるページ）
export type PageRow = AnyPage
export type Pages = Readonly<Record<string, PageRow>>
export type Folders = Readonly<Record<string, Folder>>

// ページの表 pages の、id のページ（ブックの中でも外でも。読めないページ・表に無い id は undefined）
export function pageIn(pages: Pages, id: string): ItemPage | undefined {
  const row = pages[id]
  return row?.kind === "page" ? row : undefined
}

// ページの表とフォルダの表
export interface Library {
  pages: Pages
  folders: Folders
}

// 1 回のアクションが変えたページとフォルダ（id → 新しい値。無くなった物は removed）
export interface TableChanges {
  pages: Readonly<Record<string, PageRow | typeof REMOVED>>
  folders: Readonly<Record<string, Folder | typeof REMOVED>>
}
export const NO_CHANGES: TableChanges = { pages: {}, folders: {} }
