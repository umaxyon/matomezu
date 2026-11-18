// 書庫が対象のアクションが使う、エントリの読み方と変え方: 書庫ホームかフォルダの直下に在るエントリ・名前を変える・重ならない名前にする・ゴミ箱から戻す先
import { freeTitle } from "../../../core/book"
import {
  type EntryKind,
  isMoveRefusal,
  isWithin,
  type MoveRefusal,
  placeOf,
  removedEntry,
  restoredEntry,
  rowsWithin,
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
  inTrash,
  type Library,
  type PageRow,
} from "../../../core/folders"

// 書庫ホームかフォルダの直下に在る（ゴミ箱の中でない）エントリ entry の、入れているフォルダと並びのエントリ。
// ブック・バインダの中の物、ゴミ箱かその中の物、どこにも入っていない物（書庫ホーム・ゴミ箱）は undefined
export function placedInFolder(
  folders: Folders,
  entry: string,
): { holder: Exclude<HomeOrFolder, { folderRole: "trash" }>; ref: AnyEntryRef } | undefined {
  const place = placeOf(folders, entry)
  if (!place) return undefined
  const { holder, ref } = place
  if (holder.folderRole !== "home" && holder.folderRole !== "folder") return undefined
  return inTrash(folders, entry) ? undefined : { holder, ref }
}

// エントリを入れられるフォルダか: 書庫ホームかフォルダで、ゴミ箱の中でない
export const holdsEntries = (folders: Folders, id: string): boolean => {
  const f = folders[id]
  return (f?.folderRole === "home" || f?.folderRole === "folder") && !inTrash(folders, id)
}

// エントリ entry（種類 kind）の名前を title にした書庫（名前を持たない物・書庫に無い物は null。同じ名前なら library のまま）
export function retitled(library: Library, kind: EntryKind, entry: string, title: string): Library | null {
  const now = titleOf(library, kind, entry)
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

// フォルダ into の直下に在るエントリ entry（種類 kind）の、同じフォルダのほかの物と重ならない名前（重なっていれば「名前 2」から番号を付ける。重ならなければ今の名前）。
// 名前を持たない物・フォルダが無いときは undefined
function freeTitleIn(library: Library, kind: EntryKind, entry: string, into: string): string | undefined {
  const holder = library.folders[into]
  const title = titleOf(library, kind, entry)
  return !holder || title === undefined ? undefined : freeTitle(title, titlesIn(library, holder, entry))
}

// フォルダ into の直下に在るエントリ entry（種類 kind）の名前が、同じフォルダのほかの物と重なっていれば、番号を付けた名前（「名前 2」から）にした書庫。重ならなければ library のまま
export function numbered(library: Library, kind: EntryKind, entry: string, into: string): Library | null {
  const title = freeTitleIn(library, kind, entry, into)
  return title === undefined ? null : retitled(library, kind, entry, title)
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
export function restorePlanOf(library: Library, entry: string): RestorePlan | undefined {
  const ref = trashRefOf(library.folders, entry)
  if (!ref) return undefined
  const into = restoreTargetOf(library.folders, ref.from)
  const was = ref.from[0]
  const back = restoredEntry(library, entry, into)
  const free = isMoveRefusal(back) ? undefined : freeTitleIn(back, ref.kind, entry, into)
  const replaces = (isMoveRefusal(back) ? undefined : sameTitled(back, ref.kind, entry, into)?.id) ?? REPLACES_NOTHING
  const over = isMoveRefusal(back) ? back : overwritten(back, ref.kind, entry, into, replaces)
  return {
    into,
    from: into === was ? "here" : was !== undefined && library.folders[was] ? "trashed" : "gone",
    numbered: free === undefined || free === titleOf(library, ref.kind, entry) ? SAME_TITLE : free,
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
export function sameTitled(library: Library, kind: EntryKind, entry: string, into: string): AnyEntryRef | undefined {
  const title = titleOf(library, kind, entry)
  const holder = library.folders[into]
  return title === undefined || !holder ? undefined : titledIn(library, holder, title, entry)
}

// 上書きできない訳: 種類が違う（kind）・前から在った方の中に上書きする物が在る（within）・前から在った方かその中に読めないページが在る（unreadable）・
// 同じ名前で在る物が、確かめた物と違う（changed）
export type NotOverwritten = "kind" | "within" | "unreadable" | "changed" | MoveRefusal
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
): Library | NotOverwritten {
  const there = sameTitled(library, kind, entry, into)
  if ((there?.id ?? REPLACES_NOTHING) !== replaces) return "changed"
  if (!there) return library
  if (there.kind !== kind) return "kind"
  if (isWithin(library.folders, entry, there.id)) return "within"
  const pages = there.kind === "page" ? [there.id] : rowsWithin(library.folders, there.id).pages
  if (pages.some(p => library.pages[p]?.kind === "unreadable")) return "unreadable"
  return removedEntry(library, there.id)
}
