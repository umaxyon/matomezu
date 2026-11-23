// フォルダ（ブック・バインダを含む）の中身の並びを読む・変える計算（ここには、それだけを置く）: エントリ（ページ・バインダ・ブック・フォルダ）を、
// フォルダに置く・別のフォルダの何番目かへ動かす・ゴミ箱に入れる・ゴミ箱から戻す・ゴミ箱から消す。プラグインは、並びを直に組み直さず、これを通す。
// 動かす計算が見るのは木の形（どのフォルダが何を持てるか・自分の中へは動かせない）と、まとまるタイプのページがバインダを離れるときのバインダの出来方・消え方だけ。
// 名前の重なりを断る事・タイプごとのほかの決まり・ロックは、ここでは見ない

import type { CoreCatalog } from "./core-catalog"
import {
  type AnyEntryRef,
  type BackyardEntry,
  type BinderFolder,
  backyardIdOf,
  type Folder,
  type Folders,
  HOME_ID,
  isOpenRole,
  isUnreadableRole,
  type Library,
  type PageRow,
  sameWorkKey,
  TRASH_ID,
  type TrashFolder,
  type TrashRef,
  type WorkKey,
} from "./folders"
import { foldersOver, inTrash, type StageEntry, systemFolderIndex, systemFolderOf } from "./folders-tree"
import { type Lang, translate } from "./i18n/i18n"
import { freshPageId } from "./ids"
import type { LineupEntry } from "./schema/book"
import { langOf, type Settings } from "./settings"

export type EntryKind = AnyEntryRef["kind"]

// エントリ entry を入れているフォルダと、その並びの中のエントリ（どこにも入っていなければ undefined。書庫ホームも）
export function placeOf(folders: Folders, entry: string): { holder: Folder; ref: AnyEntryRef } | undefined {
  const holder = foldersOver(folders, entry)[0]
  const ref = holder?.lineup.find(r => r.id === entry)
  return holder && ref ? { holder, ref } : undefined
}

// エントリ entry が、フォルダ over そのものか、その中（何段下でも）に在るか
export const isWithin = (folders: Folders, entry: string, over: string): boolean =>
  entry === over || foldersOver(folders, entry).some(f => f.id === over)

// フォルダ holder が、種類 kind のエントリを持てるか: 書庫ホーム・ゴミ箱・フォルダは 4 つとも、バックヤードはブック、ブックはページとバインダ、バインダはページ
export function canHold(holder: Folder, kind: EntryKind): boolean {
  if (isOpenRole(holder.folderRole)) return true
  if (holder.folderRole === "backyard") return kind === "book"
  return kind === "page" || (kind === "binder" && holder.folderRole === "book")
}

// エントリ entry が、バックヤードかその中に在るか
export const inBackyard = (folders: Folders, entry: string): boolean =>
  folders[entry]?.folderRole === "backyard" || foldersOver(folders, entry).some(f => f.folderRole === "backyard")

// ブック book がバックヤードに直に在るなら、そのバックヤードの印と、並びのエントリの workKey（無ければ undefined）
export function backyardEntryOf(folders: Folders, book: string): BackyardEntry | undefined {
  for (const f of Object.values(folders)) {
    if (f.folderRole !== "backyard") continue
    const ref = f.lineup.find(r => r.id === book)
    if (ref) return { backyard: f.backyard, workKey: ref.workKey }
  }
  return undefined
}

// 動かせない訳: エントリが無い（no-entry）・先のフォルダが無い（no-folder）・先が自分かその中（into-itself）・先のフォルダが持てない種類（kind）・
// index が末尾より先（past-end）・動かしても同じ場所（same-place）・動かす物か先が、ゴミ箱かその中（in-trash。ゴミ箱へは入れる・戻すでだけ出入りする）・
// 動かす物か先が、バックヤードかその中（in-backyard。書庫の口では、バックヤードに出し入れしない）
export type MoveRefusal =
  | "no-entry"
  | "no-folder"
  | "into-itself"
  | "kind"
  | "past-end"
  | "same-place"
  | "in-trash"
  | "in-backyard"
export const isMoveRefusal = (v: Library | EntryMoved | MoveRefusal): v is MoveRefusal => typeof v === "string"

// 書庫 library の、フォルダ puts を置き換えた（無ければ足した）書庫
const withFolders = (library: Library, puts: Readonly<Record<string, Folder>>): Library => ({
  pages: library.pages,
  folders: { ...library.folders, ...puts },
})

// エントリ entry を、フォルダ into の index 番目（動かす物を除いて数える。言わなければ末尾）へ動かした書庫。
// 同じフォルダの中の並べ替えも。動かせなければ、その訳
export function movedEntry(library: Library, entry: string, into: string, index?: number): Library | MoveRefusal {
  const { folders } = library
  const place = placeOf(folders, entry)
  if (!place) return "no-entry"
  const to = folders[into]
  if (!to) return "no-folder"
  if (to.folderRole === "trash" || inTrash(folders, entry) || inTrash(folders, into)) return "in-trash"
  if (inBackyard(folders, entry) || inBackyard(folders, into)) return "in-backyard"
  if (isWithin(folders, into, entry)) return "into-itself"
  if (!canHold(to, place.ref.kind)) return "kind"
  const { holder } = place
  const ref = { kind: place.ref.kind, id: entry } as AnyEntryRef
  const others = to.lineup.filter(r => r.id !== entry)
  const at = index ?? others.length
  if (at > others.length) return "past-end"
  if (holder.id === to.id && holder.lineup.findIndex(r => r.id === entry) === at) return "same-place"
  const placed = { ...to, lineup: [...others.slice(0, at), ref, ...others.slice(at)] } as Folder
  if (holder.id === to.id) return withFolders(library, { [to.id]: placed })
  return withFolders(library, {
    [holder.id]: { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder,
    [to.id]: placed,
  })
}

// どのフォルダにも入っていないエントリ ref（行は書庫にもう在る）を、フォルダ into の index 番目（言わなければ末尾）に置いた書庫。
// もうどこかに入っている（no-entry）・先のフォルダが無い（no-folder）・先がゴミ箱かその中（in-trash）・先のフォルダが持てない種類（kind）・index が末尾より先（past-end）なら、その訳
export function placedEntry(library: Library, ref: AnyEntryRef, into: string, index?: number): Library | MoveRefusal {
  const { folders } = library
  if (placeOf(folders, ref.id)) return "no-entry"
  const to = folders[into]
  if (!to) return "no-folder"
  if (to.folderRole === "trash" || inTrash(folders, into)) return "in-trash"
  if (inBackyard(folders, into)) return "in-backyard"
  if (!canHold(to, ref.kind)) return "kind"
  const at = index ?? to.lineup.length
  if (at > to.lineup.length) return "past-end"
  const placed = { kind: ref.kind, id: ref.id } as AnyEntryRef
  return withFolders(library, {
    [to.id]: { ...to, lineup: [...to.lineup.slice(0, at), placed, ...to.lineup.slice(at)] } as Folder,
  })
}

// 書庫にまだ無いページかバインダ made（バインダは中のページごと）の行を足して、フォルダ into の index 番目（言わなければ末尾）に置いた書庫。
// 同じ id の行がもう在れば no-entry。置けない訳は placedEntry と同じ
export function placedMade(library: Library, made: LineupEntry, into: string, index?: number): Library | MoveRefusal {
  const rows = made.kind === "binder" ? made.lineup : [made]
  if (made.id in library.folders || rows.some(p => p.id in library.pages || p.id in library.folders)) return "no-entry"
  const pages = { ...library.pages, ...Object.fromEntries(rows.map(p => [p.id, p as PageRow])) }
  if (made.kind !== "binder")
    return placedEntry({ pages, folders: library.folders }, { kind: "page", id: made.id }, into, index)
  const row: BinderFolder = {
    folderRole: "binder",
    id: made.id,
    title: made.title,
    pageType: made.pageType,
    lineup: made.lineup.map(p => ({ kind: "page", id: p.id })),
  }
  return placedEntry(
    { pages, folders: { ...library.folders, [row.id]: row } },
    { kind: "binder", id: row.id },
    into,
    index,
  )
}

// 書庫 library のバックヤード（印 backyard）の中の、workKey が key のブックの id（無ければ undefined）。持ち主は、中のブックを名前でなくこれで引く
export function backyardBookOf(library: Pick<Library, "folders">, backyard: string, key: WorkKey): string | undefined {
  const row = library.folders[backyardIdOf(backyard)]
  return row?.folderRole === "backyard" ? row.lineup.find(r => sameWorkKey(r.workKey, key))?.id : undefined
}

// まだどこにも入っていないブック book（withBook で行を足した物）を、バックヤード（印 backyard）の並びの末尾に workKey key で置いた書庫。
// ブックが無いかもう入っている（no-entry）、バックヤードの行が無い（no-folder）、同じ workKey のブックがもう在る（work-key-taken）なら、その訳
export function placedInBackyard(
  library: Library,
  book: string,
  backyard: string,
  key: WorkKey,
): Library | "no-entry" | "no-folder" | "work-key-taken" {
  const { folders } = library
  if (folders[book]?.folderRole !== "book" || placeOf(folders, book)) return "no-entry"
  const row = folders[backyardIdOf(backyard)]
  if (row?.folderRole !== "backyard") return "no-folder"
  if (row.lineup.some(r => sameWorkKey(r.workKey, key))) return "work-key-taken"
  return withFolders(library, {
    [row.id]: { ...row, lineup: [...row.lineup, { kind: "book", id: book, workKey: key }] },
  })
}

// エントリ entry を、入れているフォルダから外して、ゴミ箱の末尾へ入れた書庫（入れた時刻 at と、元いたフォルダから上への id の列を、ゴミ箱の並びのエントリが持つ。
// 入れた物の行は変えない。ゴミ箱の行が無ければ作る）。エントリが無い（no-entry）か、もうゴミ箱かその中に在る（in-trash）か、バックヤードかその中に在れば（in-backyard）、その訳
export function trashedEntry(library: Library, entry: string, at: string): Library | MoveRefusal {
  const { folders } = library
  const place = placeOf(folders, entry)
  if (!place) return "no-entry"
  if (place.holder.folderRole === "trash" || inTrash(folders, entry)) return "in-trash"
  if (inBackyard(folders, entry)) return "in-backyard"
  const { holder } = place
  const kept = folders[TRASH_ID]
  const trash: TrashFolder = kept?.folderRole === "trash" ? kept : { folderRole: "trash", id: TRASH_ID, lineup: [] }
  const ref = {
    kind: place.ref.kind,
    id: entry,
    trashed: at,
    from: foldersOver(folders, entry).map(f => f.id),
  } as TrashRef
  return withFolders(library, {
    [holder.id]: { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder,
    [TRASH_ID]: { ...trash, lineup: [...trash.lineup, ref] },
  })
}

// ゴミ箱の直下のエントリ entry を、フォルダ into の末尾へ戻した書庫。ゴミ箱の直下に無い（no-entry）・先のフォルダが無い（no-folder）・
// 先がゴミ箱かその中（in-trash）・先のフォルダが持てない種類（kind）なら、その訳
export function restoredEntry(library: Library, entry: string, into: string): Library | MoveRefusal {
  const { folders } = library
  const trash = folders[TRASH_ID]
  const ref = trashRefOf(folders, entry)
  if (!trash || !ref) return "no-entry"
  const to = folders[into]
  if (!to) return "no-folder"
  if (to.folderRole === "trash" || inTrash(folders, into)) return "in-trash"
  if (!canHold(to, ref.kind)) return "kind"
  const back = { kind: ref.kind, id: entry } as AnyEntryRef
  // システムフォルダは、書庫ホームの先頭の、印の順の所へ戻る（ほかの物は末尾）
  const mark = systemFolderOf(folders[entry])
  const at = mark === undefined || to.id !== HOME_ID ? to.lineup.length : systemFolderIndex(folders, mark)
  return withFolders(library, {
    [TRASH_ID]: { ...trash, lineup: trash.lineup.filter(r => r.id !== entry) } as Folder,
    [to.id]: { ...to, lineup: [...to.lineup.slice(0, at), back, ...to.lineup.slice(at)] } as Folder,
  })
}

// エントリ entry と、その中の物（何段下でも）の、ページの行の id とフォルダの行の id（表に無い物の id も）
export function rowsWithin(folders: Folders, entry: string): { pages: string[]; folders: string[] } {
  const out = { pages: [] as string[], folders: [] as string[] }
  const passed = new Set<string>()
  const walk = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    out.folders.push(id)
    for (const r of folders[id]?.lineup ?? []) {
      if (r.kind === "page") out.pages.push(r.id)
      else walk(r.id)
    }
  }
  walk(entry)
  return out
}

// エントリ entry を、入れているフォルダの並びから外し、その行と中の物の行を書庫から消した書庫（エントリがどこにも入っていなければ、その訳 no-entry）
export function removedEntry(library: Library, entry: string): Library | MoveRefusal {
  const place = placeOf(library.folders, entry)
  if (!place) return "no-entry"
  const { holder, ref } = place
  const under = ref.kind === "page" ? { pages: [entry], folders: [] } : rowsWithin(library.folders, entry)
  const pages = new Set(under.pages)
  const gone = new Set(under.folders)
  const emptied = { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder
  const folders = Object.fromEntries(
    Object.entries(library.folders).flatMap(([id, f]): [string, Folder][] =>
      gone.has(id) ? [] : [[id, id === holder.id ? emptied : f]],
    ),
  )
  return {
    pages:
      pages.size === 0
        ? library.pages
        : Object.fromEntries(Object.entries(library.pages).filter(([p]) => !pages.has(p))),
    folders,
  }
}

// フォルダ folder が、ブックの外のバインダ（書庫ホームかフォルダの直下のバインダ）か
function binderOutsideBooks(folders: Folders, folder: string): boolean {
  const over = placeOf(folders, folder)?.holder.folderRole
  return folders[folder]?.folderRole === "binder" && (over === "home" || over === "folder")
}

// 作るバインダの印: エントリを動かすときに、そのページだけのバインダを作って入れる
export const NEW_BINDER = "new-binder"

// エントリ entry をフォルダ into へ動かすときに、into へ入る物: まとまるタイプ（grouping が binder）のページを、バインダからバインダでない所へ動かすなら、
// そのページだけの新しいバインダ（NEW_BINDER）。ただし、ブックの外の、中がそのページだけのバインダからなら、そのバインダ。ほかは entry そのもの。
// entry がどこにも入っていなければ undefined
export function carriedEntry(
  catalog: CoreCatalog,
  { pages, folders }: Library,
  entry: string,
  into: string,
): AnyEntryRef | typeof NEW_BINDER | undefined {
  const place = placeOf(folders, entry)
  if (!place) return undefined
  const { holder, ref } = place
  const to = folders[into]
  const page = pages[entry]
  const leaves = ref.kind === "page" && holder.folderRole === "binder" && to !== undefined && to.folderRole !== "binder"
  if (!leaves || !page || catalog.pageTypes.get(page.type)?.grouping !== "binder") return ref
  return binderOutsideBooks(folders, holder.id) && holder.lineup.length === 1
    ? { kind: "binder", id: holder.id }
    : NEW_BINDER
}

// 書庫 library で、フォルダ from がブックの外のバインダで空なら、それを行ごと消した書庫（ほかは library のまま）
function withoutEmptied(library: Library, from: Folder): Library {
  const now = library.folders[from.id]
  if (now?.folderRole !== "binder" || now.lineup.length > 0 || !binderOutsideBooks(library.folders, from.id))
    return library
  const gone = removedEntry(library, from.id)
  return isMoveRefusal(gone) ? library : gone
}

// エントリを動かした結果: 動かした書庫 next と、into へ入った物 carried（carriedEntry の物。作ったバインダなら、その id）と、作ったバインダの id と名前 made
export interface EntryMoved {
  next: Library
  carried: AnyEntryRef
  made?: { id: string; title: string }
}

// エントリ entry を、フォルダ into の index 番目（動かす物を除いて数える。言わなければ末尾）へ動かした書庫（movedEntry に、バインダの出来方・消え方を足した物。純粋）。
// into へ入る物は carriedEntry が決める。新しいバインダを作るなら、その id を newId で振り（書庫のページ・フォルダの行の id と重なれば、newId で振り直す）、
// 名前は「元のバインダの名前 - ページの名前」（片方が無題なら、もう片方の名前だけ）で、into の直下の名前と重なれば番号を付け（freeTitle）、
// into の index 番目に置いてページを入れる。
// ページが出て空になったブックの外のバインダは、行ごと消す（ブックの中のバインダは、空になっても残る）。動かせなければ、その訳
export function movedWithBinders(
  catalog: CoreCatalog,
  library: Library,
  entry: string,
  into: string,
  index: number | undefined,
  naming: Naming,
  newId: () => string,
): EntryMoved | MoveRefusal {
  const carried = carriedEntry(catalog, library, entry, into)
  const from = placeOf(library.folders, entry)?.holder
  if (!carried || !from) return "no-entry"
  if (carried !== NEW_BINDER) {
    const moved = movedEntry(library, carried.id, into, index)
    return isMoveRefusal(moved) ? moved : { next: withoutEmptied(moved, from), carried }
  }
  const to = library.folders[into]
  if (!to) return "no-folder"
  if (from.folderRole !== "binder") return "kind"
  if (to.folderRole === "trash" || inTrash(library.folders, entry) || inTrash(library.folders, into)) return "in-trash"
  if (inBackyard(library.folders, entry) || inBackyard(library.folders, into)) return "in-backyard"
  const id = freshPageId(newId, [...Object.keys(library.pages), ...Object.keys(library.folders)])
  const named = [titleOf(library, "binder", from.id, naming), titleOf(library, "page", entry, naming)]
  const title = freeTitle(named.filter(t => t !== undefined).join(" - "), titlesIn(library, to, naming))
  const binder: BinderFolder = {
    folderRole: "binder",
    id,
    title,
    pageType: from.pageType,
    lineup: [{ kind: "page", id: entry }],
  }
  const left: BinderFolder = { ...from, lineup: from.lineup.filter(r => r.id !== entry) }
  const placed = placedEntry(
    withFolders(library, { [from.id]: left, [id]: binder }),
    { kind: "binder", id },
    into,
    index,
  )
  if (isMoveRefusal(placed)) return placed
  return { next: withoutEmptied(placed, from), carried: { kind: "binder", id }, made: { id, title } }
}

// ゴミ箱の並びのエントリ（入れた時刻と、元いたフォルダの列を持つ。入れた順）
export function trashRefsOf(folders: Folders): readonly TrashRef[] {
  const trash = folders[TRASH_ID]
  return trash?.folderRole === "trash" ? trash.lineup : []
}

// ゴミ箱の直下のエントリ entry の、ゴミ箱の並びのエントリ（無ければ undefined）
export const trashRefOf = (folders: Folders, entry: string): TrashRef | undefined =>
  trashRefsOf(folders).find(r => r.id === entry)

// 書庫が was から now に変わる間に、ゴミ箱に入った物（trashed）と、ゴミ箱から出た物（restored）の id。ゴミ箱の中の物ごと出入りした、中の物も入る。
// now に在る物だけを見る（消えた物は入らない）
export function binnedBetween(was: Library, now: Library): { trashed: string[]; restored: string[] } {
  const ids = [...Object.keys(now.pages), ...Object.keys(now.folders)]
  const here = (l: Library, id: string) => id in l.pages || id in l.folders
  return {
    trashed: ids.filter(id => inTrash(now.folders, id) && here(was, id) && !inTrash(was.folders, id)),
    restored: ids.filter(id => !inTrash(now.folders, id) && inTrash(was.folders, id)),
  }
}

// 断りの種類: 同じフォルダの中に、同じ名前の物が在る（土台が断るので、プラグインの id の名前空間は付かない）
export const TITLE_TAKEN = "title-taken"
// 断りの種類: バックヤードの中の物の名前を変える・持ち主でないプラグインがバックヤードにブックを作る（土台が断るので、名前空間は付かない）
export const IN_BACKYARD = "in-backyard"

// 名前を引く決まり: 機能台帳と、名前を引く言語（システムフォルダの名前は、定義の文言をこの言語で引く）
export interface Naming {
  catalog: CoreCatalog
  lang: Lang
}
// 言語 lang で名前を引く決まり（AI に見せる名前は英語 "en"）
export const namingIn = (catalog: CoreCatalog, lang: Lang): Naming => ({ catalog, lang })
// 利用者の設定 settings の言語で名前を引く決まり（言語を選んでいない・使えなければ英語）。画面も常駐も、名前の決まりはこれで引く
export const namingOf = (catalog: CoreCatalog, settings: Settings): Naming =>
  namingIn(catalog, langOf(catalog, settings, "en"))

// 名前が無いときの値（名前の無い物・書庫に無い物・利用者名を決めていない。どの名前とも重ならないよう、文字列にしない）
export const NO_NAME: unique symbol = Symbol("no name")

// ページかフォルダの行 row（種類 kind）の名前（名前の無い物・行が無ければ undefined）。名前を引くのは、ここだけ:
// システムフォルダは、印の定義の title を naming の言語で引く（定義が機能台帳に無ければ名前の無い物）。ほかは行の title
export function rowTitle(row: unknown, kind: EntryKind, naming: Naming): string | undefined {
  if (typeof row !== "object" || row === null) return undefined
  const { title, systemFolder } = row as { title?: unknown; systemFolder?: unknown }
  if (kind !== "page" && typeof systemFolder === "string") {
    const def = naming.catalog.systemFolders.get(systemFolder)
    return def ? translate(naming.catalog.messages, naming.lang, def.title) : undefined
  }
  return typeof title === "string" && title !== "" ? title : undefined
}

// エントリ entry（種類 kind）の名前（名前の無い物・書庫に無い物は undefined）
export const titleOf = (
  { pages, folders }: Library,
  kind: EntryKind,
  entry: string,
  naming: Naming,
): string | undefined => rowTitle(kind === "page" ? pages[entry] : folders[entry], kind, naming)

const NO_ENTRIES: readonly AnyEntryRef[] = []

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）の直下のエントリ（並びの順。フォルダが無ければ空）
export const entriesIn = (folders: Folders, folder: string): readonly AnyEntryRef[] =>
  folders[folder]?.lineup ?? NO_ENTRIES

// 名前 title を、同じ所の名前 taken と重ならない名前にする（重ならなければそのまま。重なれば「名前 2」から番号を付ける）
export function freeTitle(title: string, taken: readonly string[]): string {
  if (!taken.includes(title)) return title
  for (let n = 2; ; n++) {
    const made = `${title} ${n}`
    if (!taken.includes(made)) return made
  }
}

// フォルダ folder の直下のエントリの名前（並びの順。名前の無い物は入らない。except のエントリは除く）
export function titlesIn(library: Library, folder: Folder, naming: Naming, except?: string): string[] {
  return folder.lineup.flatMap(r => {
    const title = r.id === except ? undefined : titleOf(library, r.kind, r.id, naming)
    return title === undefined ? [] : [title]
  })
}

// フォルダ folder の直下で、名前が title のエントリ（except のエントリは除く。無ければ undefined）
export const titledIn = (
  library: Library,
  folder: Folder,
  title: string,
  naming: Naming,
  except?: string,
): AnyEntryRef | undefined =>
  folder.lineup.find(r => r.id !== except && titleOf(library, r.kind, r.id, naming) === title)

// 名前が重なったフォルダ clashes（titleClashes が挙げた物）の直下で、ほかの物と名前が重なるシステムフォルダの印（定義の id。無ければ undefined）
export function clashedSystemFolder(library: Library, clashes: readonly string[], naming: Naming): string | undefined {
  for (const id of clashes) {
    const folder = library.folders[id]
    if (!folder) continue
    const titles = folder.lineup.map(r => titleOf(library, r.kind, r.id, naming))
    for (const [i, r] of folder.lineup.entries()) {
      const mark = r.kind === "page" ? undefined : systemFolderOf(library.folders[r.id])
      if (mark !== undefined && titles[i] !== undefined && titles.filter(t => t === titles[i]).length > 1) return mark
    }
  }
  return undefined
}

// フォルダ f の直下で、名前が重ならないように数えるか（ゴミ箱・読めない物のフォルダ・バックヤードの直下は、名前が重なってよい。ゴミ箱の中のフォルダの直下は数える。
// バックヤードのブックは、持ち主のプラグインが名前でなくキーで引く）。重なりを確かめる titleClashes と、重なりに番号を付ける withFreeTitles の両方が、これで決める
export const keepsTitlesApart = (f: Folder): boolean =>
  f.folderRole !== "trash" && f.folderRole !== "backyard" && !isUnreadableRole(f.folderRole)

// 書庫 library で、直下に同じ名前が重なっている書庫ホーム・フォルダ・ブック・バインダの id（keepsTitlesApart の物だけ。名前は naming で引く）
export function titleClashes(library: Library, naming: Naming): string[] {
  return Object.values(library.folders).flatMap(f => {
    if (!keepsTitlesApart(f)) return []
    const titles = titlesIn(library, f, naming)
    return new Set(titles).size === titles.length ? [] : [f.id]
  })
}

// ステージエントリ entry の行を row に替えた書庫
export function withStageEntryRow(library: Library, entry: StageEntry, row: PageRow | Folder): Library {
  return entry.kind === "page"
    ? { pages: { ...library.pages, [entry.id]: row as PageRow }, folders: library.folders }
    : { pages: library.pages, folders: { ...library.folders, [entry.id]: row as Folder } }
}

// エントリ entry（種類 kind）の名前を title にした書庫（名前を持たない物・書庫に無い物は null。同じ名前なら library のまま）。ロックは見ない
export function retitled(
  library: Library,
  kind: EntryKind,
  entry: string,
  title: string,
  naming: Naming,
): Library | null {
  const now = titleOf(library, kind, entry, naming)
  if (now === undefined) return null
  if (now === title) return library
  if (kind === "page")
    return {
      pages: { ...library.pages, [entry]: { ...library.pages[entry], title } as PageRow },
      folders: library.folders,
    }
  return {
    pages: library.pages,
    folders: { ...library.folders, [entry]: { ...library.folders[entry], title } as Folder },
  }
}

// 名前に番号を付けた物 1 つ: エントリの種類と id と、付けた名前
export interface FreedTitle {
  kind: EntryKind
  id: string
  title: string
}

// 書庫 library の、直下の名前の重なりを番号で直した書庫と、番号を付けた物（付けた順。純粋。同じ入力なら同じ結果、2 回行っても 1 回と同じ）。
// keepsTitlesApart のフォルダごとに、システムフォルダは名前を変えずに先に名前を取り、ほかは並びの先の物が名前を残して、後の物に「名前 2」から番号を付ける
// （番号は、そのフォルダのほかの物の名前とも重ならない）。ロックの掛かった物にも付ける。名前は naming で引く
export function withFreeTitles(library: Library, naming: Naming): { next: Library; freed: FreedTitle[] } {
  let next = library
  const freed: FreedTitle[] = []
  for (const id of Object.keys(library.folders).sort()) {
    const folder = library.folders[id]
    if (!folder || !keepsTitlesApart(folder)) continue
    const isSystem = (r: AnyEntryRef) => r.kind !== "page" && systemFolderOf(library.folders[r.id]) !== undefined
    const named = (r: AnyEntryRef) => titleOf(next, r.kind, r.id, naming)
    const kept = new Set(folder.lineup.filter(isSystem).flatMap(r => named(r) ?? []))
    for (const r of folder.lineup) {
      if (isSystem(r)) continue
      const title = named(r)
      if (title === undefined) continue
      if (!kept.has(title)) {
        kept.add(title)
        continue
      }
      const to = freeTitle(title, [...kept, ...folder.lineup.flatMap(o => named(o) ?? [])])
      const done = retitled(next, r.kind, r.id, to, naming)
      if (!done) continue
      next = done
      kept.add(to)
      freed.push({ kind: r.kind, id: r.id, title: to })
    }
  }
  return { next, freed }
}

// 書庫 library に足りないシステムフォルダの印（機能台帳 catalog に定義が在り、ゴミ箱の外に行が無い物。印の順）
export function missingSystemFolders(library: Library, catalog: CoreCatalog): string[] {
  const outside = new Set(
    Object.values(library.folders).flatMap(f => {
      const mark = systemFolderOf(f)
      return mark === undefined || inTrash(library.folders, f.id) ? [] : [mark]
    }),
  )
  return [...catalog.systemFolders.keys()].filter(mark => !outside.has(mark)).sort()
}

// 書庫 library に、足りないシステムフォルダ（missingSystemFolders）の空の行を、書庫ホームの先頭（印の順の所）に足した書庫と、足した行の id と印（足した順。純粋）。
// 行の id は newId で振る。振った id が書庫に在れば null。書庫ホームが無ければ何も足さない。名前の重なりは直さない（withFreeTitles）
export function withSystemFolders(
  library: Library,
  catalog: CoreCatalog,
  newId: () => string,
): { next: Library; added: { id: string; systemFolder: string }[] } | null {
  let next = library
  const added: { id: string; systemFolder: string }[] = []
  for (const mark of missingSystemFolders(library, catalog)) {
    const home = next.folders[HOME_ID]
    if (!home) break
    const id = newId()
    if (id in next.folders || id in next.pages) return null
    const at = systemFolderIndex(next.folders, mark)
    const row = { folderRole: "folder", id, systemFolder: mark, lineup: [] } as unknown as Folder
    const lineup = [...home.lineup.slice(0, at), { kind: "folder" as const, id }, ...home.lineup.slice(at)]
    next = { pages: next.pages, folders: { ...next.folders, [id]: row, [HOME_ID]: { ...home, lineup } as Folder } }
    added.push({ id, systemFolder: mark })
  }
  return { next, added }
}

// 書庫 library に、機能台帳 catalog に定義が在って行が無いバックヤードの、空の行を足した書庫（印の順。行の id は backyardIdOf。純粋）。
// その id の行がバックヤードでない物として在れば、足さない（木の決まりが破れて見える）
export function withBackyards(library: Library, catalog: CoreCatalog): Library {
  const rows: Record<string, Folder> = {}
  for (const mark of [...catalog.backyards.keys()].sort()) {
    const id = backyardIdOf(mark)
    if (id in library.folders || id in library.pages) continue
    rows[id] = { folderRole: "backyard", id, backyard: mark, lineup: [] }
  }
  return Object.keys(rows).length === 0 ? library : withFolders(library, rows)
}
