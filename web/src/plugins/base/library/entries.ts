// 書庫が対象のアクションが使う、エントリの読み方と変え方: ゴミ箱の外に在るエントリ・動かせる先・名前を変える・重ならない名前にする・ゴミ箱から戻す先

import {
  type EntryKind,
  freeTitleIn,
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
import { foldersOver, inTrash, isKeptSystemFolder } from "../../../core/folders-tree"

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
// ブックの中の物（ページ・バインダ）なら、ブックかバインダの中へだけ（ブックの外へは出さない）、バインダの中のページなら、バインダの中へだけ（バインダの外へ 1 枚ずつは出さない）。
// ブックの外の物なら、ブックの外へだけ（ブックかバインダの中へは入れない）。持てる種類か・自分の中へでないかは、土台（core/entries.ts の movedEntry）が見る
export function movesInto(folders: Folders, entry: string, into: string): boolean {
  const place = placedOutsideTrash(folders, entry)
  const to = folders[into]
  if (!place || !to || to.folderRole === "trash" || inTrash(folders, into)) return false
  const toBook = to.folderRole === "book" || to.folderRole === "binder"
  if (place.holder.folderRole === "binder") return to.folderRole === "binder"
  if (place.holder.folderRole === "book") return toBook
  return !toBook
}

// 新しいブック・フォルダを作る先: フォルダ opened がエントリを入れられれば、そこ。入れられなければ（ブック・バインダ）、それを入れている一番近い書庫ホームかフォルダ。
// ゴミ箱とその中なら undefined
export const holderForNew = (folders: Folders, opened: string): string | undefined =>
  holdsEntries(folders, opened) ? opened : foldersOver(folders, opened).find(f => holdsEntries(folders, f.id))?.id

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
