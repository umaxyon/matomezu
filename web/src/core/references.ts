// 参照エントリ: ブックの並びに置く、ほかの所のページ（バインダの外の物）かバインダを id で指す 1 つ。中身・名前・設定を持たず、指す先を見るだけで描く。
// 参照エントリは、指す先が書庫に在る限り残る（ゴミ箱・読めない物のフォルダに居る間も残り、描く所が無いと見せる）。
// 指す先が完全に消されたときと、指す先が参照エントリを置いたブックの中に入ったとき、指す先のページがバインダに入ったときは、書庫を変えた書き込みと同じ書き込みで、仕組みが消す

import { NO_PAGE, referencesOf } from "./book"
import { inBackyard } from "./entries"
import {
  type BinderFolder,
  type BookFolder,
  type Folder,
  type Folders,
  isUnreadableRole,
  type Library,
  type PageRow,
} from "./folders"
import { foldersOver } from "./folders-tree"
import type { ReferenceEntry, StageLineup } from "./schema/book"

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
function stays(library: Library, book: string, ref: ReferenceEntry): boolean {
  const over = foldersOver(library.folders, ref.of.id)
  return (
    targetOf(library, ref) !== undefined &&
    !over.some(f => f.id === book) &&
    (ref.of.kind === "binder" || over[0]?.folderRole !== "binder")
  )
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
// ページならバインダに入っていない）か。バックヤードの中のブックには置けず、バックヤードの中の物は指せない
export function newReferencesHold(library: Library, was: StageLineup, now: StageLineup): boolean {
  const before = new Set(referencesOf(was).map(r => r.id))
  return referencesOf(now).every(r => before.has(r.id) || placeable(library, now.id, r))
}

// ブック book に、ref を新しく置いて描けるか（newReferencesHold の 1 つ分）
const placeable = (library: Library, book: string, ref: ReferenceEntry): boolean =>
  referredOf(library, ref) !== UNSEEN &&
  stays(library, book, ref) &&
  !inBackyard(library.folders, book) &&
  !inBackyard(library.folders, ref.of.id)

// ブック book に、of を指す参照エントリを置けるか（書庫で置く物・置く先を選ぶ形が、選べる行を決める）: book が書庫の見える所に在るブックで、
// of を指す参照エントリをまだ持たず、newReferencesHold が新しく置いた物に求める事を満たす
export function referable(library: Library, book: string, of: ReferenceEntry["of"]): boolean {
  const holder = library.folders[book]
  if (holder?.folderRole !== "book" || !inSight(library.folders, book)) return false
  if (holder.lineup.some(r => r.kind === "reference" && r.of.id === of.id)) return false
  return placeable(library, book, { kind: "reference", id: "", of })
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
