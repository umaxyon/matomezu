// 書庫が対象のアクションが使う、エントリの読み方と変え方: ゴミ箱の外に在るエントリ・動かせる先・名前を変える・重ならない名前にする・ゴミ箱から戻す先

import { binderIsEmpty, binderTakes } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import {
  type EntryKind,
  freeTitle,
  isMoveRefusal,
  isWithin,
  type MoveRefusal,
  type Naming,
  placeOf,
  removedEntry,
  restoredEntry,
  retitled,
  titledIn,
  titleOf,
  titlesIn,
  trashRefOf,
} from "../../../core/entries"
import {
  type AnyEntryRef,
  type Folder,
  type Folders,
  HOME_ID,
  type HomeOrFolder,
  type Library,
} from "../../../core/folders"
import { atOutsideBinderPlace, foldersOver, inTrash, isKeptSystemFolder } from "../../../core/folders-tree"
import { typeAllows } from "../../../core/inspect"

// フォルダ into の直下に在る（か、そこへ入れる）エントリ entry（種類 kind）の、そのフォルダのほかの物と重ならない名前（重なっていれば「名前 2」から番号を付ける。重ならなければ今の名前）。
// 名前を持たない物・フォルダが無いときは undefined
export function freeTitleIn(
  library: Library,
  kind: EntryKind,
  entry: string,
  into: string,
  naming: Naming,
): string | undefined {
  const holder = library.folders[into]
  const title = titleOf(library, kind, entry, naming)
  return !holder || title === undefined ? undefined : freeTitle(title, titlesIn(library, holder, naming, entry))
}

// ゴミ箱の外のどこか（書庫ホーム・フォルダ・ブック・バインダ）に入っているエントリ entry の、入れているフォルダと並びのエントリ。
// ゴミ箱かその中の物、どこにも入っていない物（書庫ホーム・ゴミ箱）は undefined
export function placedOutsideTrash(folders: Folders, entry: string): { holder: Folder; ref: AnyEntryRef } | undefined {
  const place = placeOf(folders, entry)
  if (!place || place.holder.folderRole === "trash" || inTrash(folders, entry)) return undefined
  return place
}

// ブックかバインダの中に在る（ゴミ箱の中でない）エントリ entry（ブックの中のページ・バインダ）か
export const placedInBook = (folders: Folders, entry: string): boolean => {
  const role = placedOutsideTrash(folders, entry)?.holder.folderRole
  return role === "book" || role === "binder"
}

// 書庫ホームかフォルダの直下に在る（ゴミ箱の中でない）エントリ entry の、入れているフォルダと並びのエントリ。
// ブック・バインダの中の物、ゴミ箱かその中の物、どこにも入っていない物（書庫ホーム・ゴミ箱）は undefined
export function placedOutsideBooks(
  folders: Folders,
  entry: string,
): { holder: Exclude<HomeOrFolder, { folderRole: "trash" }>; ref: AnyEntryRef } | undefined {
  const place = placedOutsideTrash(folders, entry)
  if (!place) return undefined
  const { holder, ref } = place
  return holder.folderRole === "home" || holder.folderRole === "folder" ? { holder, ref } : undefined
}

// エントリを入れられるフォルダか: 書庫ホームかフォルダで、ゴミ箱の中でない
export const holdsEntries = (folders: Folders, id: string): boolean => {
  const f = folders[id]
  return (f?.folderRole === "home" || f?.folderRole === "folder") && !inTrash(folders, id)
}

// エントリ entry を、フォルダ into へ動かす（同じフォルダの中の並べ替えも）のを、書庫が対象のアクションが扱うか: entry がゴミ箱の外に在り、into がゴミ箱の外のフォルダ・ブック・バインダで、
// まとまるタイプ（grouping が binder）のページなら、バインダから、同じタイプで紙と向きのそろうバインダへと、バインダでない所へ（そのページだけのバインダが出来る。
// core/entries.ts の movedWithBinders）。まとまらないタイプのページなら、バインダでない所へ（ブックと書庫ホーム・フォルダの間も）。
// バインダなら、ブックと書庫ホーム・フォルダの間も（空のバインダはブックの外へ出さない）。ブック・フォルダなら、ブックの外へだけ。
// 持てる種類か・自分の中へでないかは、土台（core/entries.ts の movedWithBinders）が見る
export function movesInto(catalog: CoreCatalog, { pages, folders }: Library, entry: string, into: string): boolean {
  const place = placedOutsideTrash(folders, entry)
  const to = folders[into]
  if (!place || !to || to.folderRole === "trash" || inTrash(folders, into)) return false
  const from = place.holder.folderRole
  if (place.ref.kind === "page") {
    const page = pages[entry]
    if (!page || catalog.pageTypes.get(page.type)?.grouping !== "binder") return to.folderRole !== "binder"
    if (from !== "binder") return false
    if (to.folderRole !== "binder") return true
    return binderTakes(catalog, { pages, folders }, into, page)
  }
  if (place.ref.kind === "binder") {
    const leaves = from === "book" && to.folderRole !== "book"
    return !leaves || !binderIsEmpty(folders, entry)
  }
  return to.folderRole !== "book" && to.folderRole !== "binder"
}

// 新しいブック・フォルダを作る先: フォルダ opened がエントリを入れられれば、そこ。入れられなければ（ブック・バインダ）、それを入れている一番近い書庫ホームかフォルダ。
// ゴミ箱とその中なら undefined
export const holderForNew = (folders: Folders, opened: string): string | undefined =>
  holdsEntries(folders, opened) ? opened : foldersOver(folders, opened).find(f => holdsEntries(folders, f.id))?.id

// 新しいページを作る先: フォルダ opened が、書庫ホーム・フォルダ・ブック・ブックの外のバインダ（どれもゴミ箱の外）なら、そこ。
// ほか（ブックの中のバインダ）は、それを入れている一番近い、ページを作れるフォルダ。ゴミ箱とその中なら undefined
export const holderForNewPage = (folders: Folders, opened: string): string | undefined => {
  const takes = (id: string): boolean => {
    const role = folders[id]?.folderRole
    if (role === "book") return placedOutsideTrash(folders, id) !== undefined
    return role === "binder" ? atOutsideBinderPlace(folders, id) : holdsEntries(folders, id)
  }
  return takes(opened) ? opened : foldersOver(folders, opened).find(f => takes(f.id))?.id
}

// 作る先 into に、タイプ type のページを作るときのフォルダ: into がブックの外のバインダで、そのバインダのタイプでなければ、バインダを入れているフォルダ。ほかは into
export const folderForType = (folders: Folders, into: string, type: string): string | undefined => {
  const row = folders[into]
  return row?.folderRole === "binder" && row.pageType !== type ? holderForNew(folders, into) : into
}

// フォルダ into の直下に在るエントリ entry（種類 kind）の名前が、同じフォルダのほかの物と重なっていれば、番号を付けた名前（「名前 2」から）にした書庫。重ならなければ library のまま
export function numbered(
  library: Library,
  kind: EntryKind,
  entry: string,
  into: string,
  naming: Naming,
): Library | null {
  const title = freeTitleIn(library, kind, entry, into, naming)
  return title === undefined ? null : retitled(library, kind, entry, title, naming)
}

// ゴミ箱から戻す先のフォルダの id: 元いたフォルダから上への列 from（近い順）のうち、今も在ってゴミ箱でもその中でもない最初のフォルダ。どれも無ければ書庫ホーム
export const restoreTargetOf = (folders: Folders, from: readonly string[]): string =>
  from.find(id => folders[id] !== undefined && folders[id].folderRole !== "trash" && !inTrash(folders, id)) ?? HOME_ID

// ゴミ箱の直下のエントリ entry を戻すときに、利用者に確かめる事（entry-restore と同じ読み方で出す）: 戻すと入るフォルダの id into、元いたフォルダが今どうなっているか from
// （"here" は在って、そこへ戻る。"trashed" はゴミ箱かその中に在る、"gone" は書庫から消えた。どちらも、その上の今も在るフォルダへ戻る）、
// 入る先に同じ名前の物が在るときに番号を付けた名前 numbered（重ならなければ SAME_TITLE）と、そのとき上書きすると消える物の id replaces（無ければ REPLACES_NOTHING）と、上書きできるか overwrite（できなければ、その訳）
export interface RestorePlan {
  into: string
  from: "here" | "trashed" | "gone"
  numbered: string
  replaces: string
  overwrite: "ok" | NotOverwritten
}
export const SAME_TITLE = ""

// ゴミ箱の直下に無ければ undefined
export function restorePlanOf(library: Library, entry: string, naming: Naming): RestorePlan | undefined {
  const ref = trashRefOf(library.folders, entry)
  if (!ref) return undefined
  const into = restoreTargetOf(library.folders, ref.from)
  const was = ref.from[0]
  const back = restoredEntry(library, entry, into)
  const free = isMoveRefusal(back) ? undefined : freeTitleIn(back, ref.kind, entry, into, naming)
  const replaces =
    (isMoveRefusal(back) ? undefined : sameTitled(back, ref.kind, entry, into, naming)?.id) ?? REPLACES_NOTHING
  const over = isMoveRefusal(back) ? back : overwritten(back, ref.kind, entry, into, replaces, naming)
  return {
    into,
    from: into === was ? "here" : was !== undefined && library.folders[was] ? "trashed" : "gone",
    numbered: free === undefined || free === titleOf(library, ref.kind, entry, naming) ? SAME_TITLE : free,
    replaces,
    overwrite: isNotOverwritten(over) ? over : "ok",
  }
}

// 上書きを選べない訳: 上書きの決まりが断る（NotOverwritten）か、認可ステップ permission が止める（ロック中など。null は、認可ステップでない訳）
export type ReplaceBlocked = { by: "rule"; why: NotOverwritten } | { by: "permission"; permission: string | null }

// 確かめた plan の上書きを選べない訳（選べれば null）。allowed は、上書きのアクションを行えるかの答え
export const replaceBlockedOf = (
  plan: Pick<RestorePlan, "overwrite">,
  allowed: { ok: true } | { ok: false; permission: string | null },
): ReplaceBlocked | null =>
  plan.overwrite !== "ok"
    ? { by: "rule", why: plan.overwrite }
    : allowed.ok
      ? null
      : { by: "permission", permission: allowed.permission }

// フォルダ into の直下で、エントリ entry（種類 kind）と同じ名前を持つ、ほかのエントリ（無ければ undefined）
export function sameTitled(
  library: Library,
  kind: EntryKind,
  entry: string,
  into: string,
  naming: Naming,
): AnyEntryRef | undefined {
  const title = titleOf(library, kind, entry, naming)
  const holder = library.folders[into]
  return title === undefined || !holder ? undefined : titledIn(library, holder, title, naming, entry)
}

// 上書きできない訳: 種類が違う（kind）・前から在った方の中に上書きする物が在る（within）・
// 前から在った方が、定義が機能台帳に在るシステムフォルダ（system-folder）・同じ名前で在る物が、確かめた物と違う（changed）
export type NotOverwritten = "kind" | "within" | "system-folder" | "changed" | MoveRefusal
export const REPLACES_NOTHING = ""
export const isNotOverwritten = (v: Library | NotOverwritten): v is NotOverwritten => typeof v === "string"

// 上書き: フォルダ into の直下の、エントリ entry（種類 kind）と同じ名前の物を、中身ごと書庫から消した書庫（ゴミ箱には入れない。同じ名前の物が無ければ library のまま）。
// 上書きできなければ、その訳（ロックした物は、認可ステップが行った後の確かめで止める）
// replaces は、利用者が消えると確かめた物の id（無ければ REPLACES_NOTHING）: 今 同じ名前で在る物がそれと違えば、上書きしない（changed）
export function overwritten(
  library: Library,
  kind: EntryKind,
  entry: string,
  into: string,
  replaces: string,
  naming: Naming,
): Library | NotOverwritten {
  const there = sameTitled(library, kind, entry, into, naming)
  if ((there?.id ?? REPLACES_NOTHING) !== replaces) return "changed"
  if (!there) return library
  if (there.kind !== kind) return "kind"
  if (isWithin(library.folders, entry, there.id)) return "within"
  if (isKeptSystemFolder(library.folders, there.id, naming.catalog.systemFolders)) return "system-folder"
  return removedEntry(library, there.id)
}

// ページのタイプ type が、ブックが対象のアクション action を使わせるか（タイプかアクションが機能台帳に無ければ使わせない）
export function typeLets(catalog: CoreCatalog, action: string, type: string | undefined): boolean {
  const def = catalog.actions.get(action)
  const t = type === undefined ? undefined : catalog.pageTypes.get(type)
  return def !== undefined && t !== undefined && typeAllows(def, t)
}
