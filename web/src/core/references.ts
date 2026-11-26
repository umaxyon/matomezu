// 参照エントリ: ブックの並びに置く、ほかの所のページ（バインダの外の物）かバインダを id で指す 1 つ。中身・名前・設定を持たず、指す先を見るだけで描く。
// 参照エントリは、指す先が書庫に在る限り残る（ゴミ箱・読めない物のフォルダに居る間も残り、描く所が無いと見せる）。
// 指す先が完全に消されたときと、指す先が参照エントリを置いたブックの中に入ったとき、指す先のページがバインダに入ったときは、書庫を変えた書き込みと同じ書き込みで、仕組みが消す

import { findBinder, NO_BINDER, NO_PAGE, referencesOf } from "./book"
import { inBackyard, placeOf } from "./entries"
import {
  type BinderFolder,
  type BookFolder,
  type Folder,
  type Folders,
  isUnreadableRole,
  type Library,
  type PageRow,
} from "./folders"
import { foldersOver, outsideBinderIn } from "./folders-tree"
import { type LibraryAndBooks, openablePage } from "./library"
import type { AnyPage, BinderEntry, LineupEntry, ReferenceEntry, StageLineup } from "./schema/book"

// 参照エントリ ref が指す物: 書庫に在り、見える所（ゴミ箱・読めない物のフォルダの外）に居る指す先（ページかバインダの行）。
// 見えない所に居るか、無ければ UNSEEN（ゴミ箱の中なら戻り得るので、参照エントリは残る）
export const UNSEEN = "unseen"
export type Referred = { kind: "page"; page: PageRow } | { kind: "binder"; binder: BinderFolder }
export function referredOf(library: Library, ref: ReferenceEntry): Referred | typeof UNSEEN {
  const found = targetOf(library, ref)
  return found === undefined || !inSight(library.folders, ref.of.id) ? UNSEEN : found
}

// id の物が、書庫の見える所（ゴミ箱・読めない物のフォルダの外）に置かれているか（ページの中身を持たない所でも読める）
export function inSight(folders: Folders, id: string): boolean {
  const over = foldersOver(folders, id)
  return over.length > 0 && !over.some(f => f.folderRole === "trash" || isUnreadableRole(f.folderRole))
}

// 参照エントリ ref の指す先の行（どこに居ても。書庫の表に無ければ undefined）
function targetOf({ pages, folders }: Library, ref: ReferenceEntry): Referred | undefined {
  const row = ref.of.kind === "page" ? pages[ref.of.id] : undefined
  if (row !== undefined) return { kind: "page", page: row }
  const binder = ref.of.kind === "binder" ? folders[ref.of.id] : undefined
  return binder?.folderRole === "binder" ? { kind: "binder", binder } : undefined
}

// 参照エントリ ref が、ブック book の並びに残れるか: 指す先が書庫に在り（ゴミ箱の中なども）、そのブックの中に居ず、ページならバインダに入っていない
const stays = (library: Library, book: string, ref: ReferenceEntry): boolean =>
  targetOf(library, ref) !== undefined && liesApart(library.folders, book, ref.of)

// of が、ブック book の中に居ず、ページならバインダに入っていない（どこに居るかはフォルダの並びで見る）
function liesApart(folders: Folders, book: string, of: ReferenceEntry["of"]): boolean {
  const over = foldersOver(folders, of.id)
  return !over.some(f => f.id === book) && (of.kind === "binder" || over[0]?.folderRole !== "binder")
}

// 書庫 library で、残れない参照エントリを並びから外したブックのフォルダの変わり（どのブックにも外す物が無ければ空）
export function deadReferences(library: Library): Readonly<Record<string, Folder>> {
  const out: Record<string, Folder> = {}
  for (const f of Object.values(library.folders as Folders)) {
    if (f.folderRole !== "book" || !f.lineup.some(r => r.kind === "reference")) continue
    const lineup = f.lineup.filter(r => r.kind !== "reference" || stays(library, f.id, r))
    if (lineup.length !== f.lineup.length) out[f.id] = { ...f, lineup } satisfies BookFolder
  }
  return out
}

// ブック was を now に替えた書庫 library で、now が新しく置いた参照エントリが、どれも指す先を描ける（書庫に在り、ゴミ箱・読めない物のフォルダに無く、このブックの中に無く、
// ページならバインダに入っていない）か。置くブックも書庫の見える所に在る。バックヤードの中のブックには置けず、バックヤードの中の物は指せない
export function newReferencesHold(library: Library, was: StageLineup, now: StageLineup): boolean {
  const before = new Set(referencesOf(was).map(r => r.id))
  return referencesOf(now).every(r => before.has(r.id) || placeable(library, now.id, r))
}

// ブック book に、ref を新しく置いて描けるか（newReferencesHold の 1 つ分）
const placeable = (library: Library, book: string, ref: ReferenceEntry): boolean =>
  holdsNewReference(library.folders, book) &&
  referableTarget(library.folders, ref.of) &&
  liesApart(library.folders, book, ref.of) &&
  targetOf(library, ref) !== undefined

// book が、参照エントリを新しく置けるブックか: 書庫の見える所に在り、バックヤードの外のブック（フォルダの表だけで読む）
export function holdsNewReference(folders: Folders, book: string): boolean {
  return folders[book]?.folderRole === "book" && inSight(folders, book) && !inBackyard(folders, book)
}

// of が、参照エントリで新しく指せる物か: フォルダの並びに of の種類で在り、書庫の見える所に居て、バックヤードの外に居て、
// ページならバインダに入っていない（置くブックとの関係は見ない。フォルダの表だけで読む）
export function referableTarget(folders: Folders, of: ReferenceEntry["of"]): boolean {
  if (placeOf(folders, of.id)?.ref.kind !== of.kind || !inSight(folders, of.id) || inBackyard(folders, of.id))
    return false
  return of.kind === "binder" || foldersOver(folders, of.id)[0]?.folderRole !== "binder"
}

// ブック book に、of を指す参照エントリを置けるか: 新しく置いた物に newReferencesHold が求める事を満たし、of を指す参照エントリをまだ持たない
export function referable(library: Library, book: string, of: ReferenceEntry["of"]): boolean {
  return referableIn(library.folders, book, of) && targetOf(library, { kind: "reference", id: "", of }) !== undefined
}

// referable を、フォルダの表だけで答える（書庫の画面のコマンドとビューが、参照を選んでいる間に選べる行を決める。ページの行を持たないので、
// ページはフォルダの並びに在れば在ると見る）
export function referableIn(folders: Folders, book: string, of: ReferenceEntry["of"]): boolean {
  const holder = folders[book]
  if (holder?.folderRole !== "book" || !holdsNewReference(folders, book)) return false
  if (holder.lineup.some(r => r.kind === "reference" && r.of.id === of.id)) return false
  return referableTarget(folders, of) && liesApart(folders, book, of)
}

// 参照エントリ ref を開いて見せるページの id: ページを指すならそのページ、バインダを指すなら、選んだページ chosen（そのバインダに無ければ最初のページ）。
// 指す先が見えない・空のバインダなら NO_PAGE
export function referencePage(library: Library, ref: ReferenceEntry, chosen: string): string {
  const found = referredOf(library, ref)
  if (found === UNSEEN) return NO_PAGE
  if (found.kind === "page") return found.page.id
  const ids = found.binder.lineup.map(p => p.id)
  return ids.includes(chosen) ? chosen : (ids[0] ?? NO_PAGE)
}

// 参照エントリ ref の指す先のタイプと名前（ページはそのタイプ、バインダは入れるページのタイプ。指す先の行が無ければ null。ゴミ箱の中なども、行が在れば答える）
export function referenceLook(library: Library, ref: ReferenceEntry): { type: string; title: string } | null {
  const found = targetOf(library, ref)
  if (found === undefined) return null
  return found.kind === "page"
    ? { type: found.page.type, title: found.page.title }
    : { type: found.binder.pageType, title: found.binder.title }
}

// 参照エントリ id を並びに置いているブックのフォルダ（どのブックにも無ければ undefined）
export function bookOfReference(folders: Folders, id: string): BookFolder | undefined {
  for (const f of Object.values(folders)) {
    if (f.folderRole === "book" && f.lineup.some(r => r.kind === "reference" && r.id === id)) return f
  }
  return undefined
}

// 並び lineup の参照エントリを、指す先の物（ページかバインダ。中身ごと）に置き換えた並びと、置き換えたページの id → そのページを持つステージエントリの id と参照エントリの id。
// 指す先が見えない物・空のバインダは除く（印刷が、参照エントリも並びの所に刷り、No Data の物は飛ばすのに使う）
export interface ReferredPage {
  outermost: string
  reference: string
}
export function referredLineup(
  from: LibraryAndBooks,
  lineup: readonly LineupEntry[],
): { lineup: (AnyPage | BinderEntry)[]; referred: ReadonlyMap<string, ReferredPage> } {
  const referred = new Map<string, ReferredPage>()
  const out = lineup.flatMap((e): (AnyPage | BinderEntry)[] => {
    if (e.kind !== "reference") return [e]
    const found = referredOf(from, e)
    if (found === UNSEEN) return []
    const first = found.kind === "page" ? found.page.id : found.binder.lineup[0]?.id
    const at = first === undefined ? undefined : openablePage(from, first)
    if (!at) return []
    const mark = (page: string) => referred.set(page, { outermost: at.outermost.id, reference: e.id })
    if (found.kind === "page") {
      mark(at.page.id)
      return [at.page as AnyPage]
    }
    const book = at.outermost.kind === "book" ? from.books[at.outermost.id] : undefined
    const binder = book ? findBinder(book, found.binder.id) : (outsideBinderIn(from, found.binder.id) ?? NO_BINDER)
    if (binder === NO_BINDER) return []
    for (const p of binder.lineup) mark(p.id)
    return [binder]
  })
  return { lineup: out, referred }
}
