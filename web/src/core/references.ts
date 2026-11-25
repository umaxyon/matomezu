// 参照エントリ: ブックの並びに置く、ほかの所のページ（バインダの外の物）かバインダを id で指す 1 つ。中身・名前・設定を持たず、指す先を見るだけで描く。
// 参照エントリは、指す先が書庫に在る限り残る（ゴミ箱・読めない物のフォルダに居る間も残り、描く所が無いと見せる）。
// 指す先が完全に消されたときと、指す先が参照エントリを置いたブックの中に入ったときは、書庫を変えた書き込みと同じ書き込みで、仕組みが消す

import { referencesOf } from "./book"
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
  if (found === undefined) return UNSEEN
  const over = foldersOver(library.folders, ref.of.id)
  if (over.length === 0 || over.some(f => f.folderRole === "trash" || isUnreadableRole(f.folderRole))) return UNSEEN
  return found
}

// 参照エントリ ref の指す先の行（どこに居ても。書庫の表に無ければ undefined）
function targetOf({ pages, folders }: Library, ref: ReferenceEntry): Referred | undefined {
  const row = ref.of.kind === "page" ? pages[ref.of.id] : undefined
  if (row !== undefined) return { kind: "page", page: row }
  const binder = ref.of.kind === "binder" ? folders[ref.of.id] : undefined
  return binder?.folderRole === "binder" ? { kind: "binder", binder } : undefined
}

// 参照エントリ ref が、ブック book の並びに残れるか: 指す先が書庫に在り（ゴミ箱の中なども）、そのブックの中に居ない
function stays(library: Library, book: string, ref: ReferenceEntry): boolean {
  return targetOf(library, ref) !== undefined && !foldersOver(library.folders, ref.of.id).some(f => f.id === book)
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
  return referencesOf(now).every(
    r =>
      before.has(r.id) ||
      (referredOf(library, r) !== UNSEEN &&
        stays(library, now.id, r) &&
        !inBackyard(library.folders, now.id) &&
        !inBackyard(library.folders, r.of.id) &&
        (r.of.kind === "binder" || foldersOver(library.folders, r.of.id)[0]?.folderRole !== "binder")),
  )
}
