// 映した節: 書庫の画面が、ワークルームのフォルダの下に映す作業机（participant/workdesks.ts）と、その下のワーカーブックとその中の物の行。
// 行はフォルダの行を持たないので、行の id は作業机ごとに作る（同じ実のブックが 2 つの作業机に映る事があるため）: 作業机は workdesk/<ワークルーム>、
// ワーカーブックは workdesk/<ワークルーム>/book、その中の物は workdesk/<ワークルーム>/e/<実の id>。実の id は uuid なので、workdesk/ で始まらない。
// 行の id から実の id へ直すのは realOf だけが行う（行の id のまま、アクションに渡さない）
import type { Folders } from "../../../core/folders"
import { foldersOver, systemFolderOf } from "../../../core/folders-tree"
import type { Workdesk } from "../participant/workdesks"
import { WORKROOMS } from "./system-folders"

const PREFIX = "workdesk/"
const BOOK = "/book"
const IN = "/e/"

export const NO_DESKS: readonly Workdesk[] = []

export const deskRowId = (room: string): string => `${PREFIX}${encodeURIComponent(room)}`
export const deskBookRowId = (room: string): string => `${deskRowId(room)}${BOOK}`
export const deskEntryRowId = (room: string, real: string): string => `${deskRowId(room)}${IN}${real}`

// 行の id が映した節の物か（作業机が今在るかは問わない）
export const isDeskRow = (id: string): boolean => id.startsWith(PREFIX)

// 映した節の行 id が指す所: 作業机（desk）・ワーカーブック（book。実のブックがまだ無ければ real が undefined）・ワーカーブックの中の物（entry。実の id real）。
// 映した節の行でなければ undefined。作業机が今無い・中の物が今のワーカーブックに無ければ、残っている一番近い上の行（作業机も無ければ GONE）
export type DeskPlace =
  | { at: "desk"; desk: Workdesk; id: string }
  | { at: "book"; desk: Workdesk; id: string; real: string | undefined }
  | { at: "entry"; desk: Workdesk; id: string; real: string }
export const GONE = "gone"

export function deskPlaceOf(
  desks: readonly Workdesk[],
  folders: Folders,
  id: string,
): DeskPlace | typeof GONE | undefined {
  if (!isDeskRow(id)) return undefined
  const rest = id.slice(PREFIX.length)
  const cut = rest.search(/\/(book$|e\/)/)
  const room = decodeURIComponent(cut < 0 ? rest : rest.slice(0, cut))
  const desk = desks.find(d => d.room === room)
  if (!desk) return GONE
  const atDesk = { at: "desk" as const, desk, id: deskRowId(room) }
  if (cut < 0) return atDesk
  const atBook = { at: "book" as const, desk, id: deskBookRowId(room), real: desk.book }
  const tail = rest.slice(cut)
  if (tail === BOOK) return atBook
  const real = tail.slice(IN.length)
  if (desk.book === undefined) return atBook
  // 今のワーカーブックの中に無ければ（作業が変わった・消えた）、ワーカーブックの行
  return foldersOver(folders, real).some(f => f.id === desk.book) ? { at: "entry", desk, id, real } : atBook
}

// 行 id の実の id（ワーカーブックと中の物は実の物の id。作業机・実のブックがまだ無いワーカーブック・映した節でない行 id は、そのまま id を返す）
export function realOf(desks: readonly Workdesk[], folders: Folders, id: string): string {
  const place = deskPlaceOf(desks, folders, id)
  if (place === undefined || place === GONE || place.at === "desk") return id
  return place.real ?? id
}

// ワークルームのフォルダの id（書庫の表に無ければ undefined）
export const workroomsFolderOf = (folders: Folders): string | undefined =>
  Object.values(folders).find(f => systemFolderOf(f) === WORKROOMS.id)?.id

// 映した節の行の、パンくずの id の列のうち、ワークルームのフォルダより下の物（作業机から、行そのものまで）
export function deskPathOf(folders: Folders, place: DeskPlace): string[] {
  const room = place.desk.room
  if (place.at === "desk") return [place.id]
  if (place.at === "book") return [deskRowId(room), place.id]
  // 実の物からワーカーブックまでの間のバインダ（近い順）を、上から並べる
  const over = foldersOver(folders, place.real)
  const inBook = over
    .slice(
      0,
      over.findIndex(f => f.id === place.desk.book),
    )
    .reverse()
  return [deskRowId(room), deskBookRowId(room), ...inBook.map(f => deskEntryRowId(room, f.id)), place.id]
}
