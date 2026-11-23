// 作業机: 書庫の画面が、ワークルームのフォルダの下に映す、今参加者がいるワークルームごとの行。その下にワーカーブック（workerBookOf が引く、tickets-history の中の実のブック）を映す。
// データには書かない（書庫の画面が、ワークルームと参加者のレコードと書庫の表から出す）
import type { CoreCatalog } from "../../../core/core-catalog"
import { backyardBookOf, rowsWithin } from "../../../core/entries"
import type { Folders } from "../../../core/folders"
import type { RecordReader } from "../../../core/record-source"
import type { Bird } from "../birds"
import { TICKETS_HISTORY } from "../library/backyards"
import { ADMIN_MARK, PARTICIPANT, type Workroom } from "."
import { originalPalette } from "./birds"
import { adminRoomOf } from "./rows"
import { workerBookOf, workerBookReadsOf } from "./worker-book"
import { WORKROOM } from "./workroom"

// 作業机 1 つ: ワークルーム room の id・名前 title・鳥 bird と配色 palette、ワーカーブックの名前 bookTitle と、実のブックの id book（まだ無ければ undefined）
export interface Workdesk {
  room: string
  title: string
  bird: Bird
  palette: string
  bookTitle: string
  book: string | undefined
}

// 作業机を出すのに読むレコードの種類（ワーカーブックを引くのに読む物と、参加者・管理者の印）
export const workdesksReadsOf = (catalog: CoreCatalog): readonly string[] => [
  ...new Set([...workerBookReadsOf(catalog), PARTICIPANT.id, ADMIN_MARK.id]),
]

// 作業机（管理者のワークルームが先、ほかは参加者を受け入れた順。同じ時刻ならワークルームの id の順）。
// read は workdesksReadsOf の種類を読める読み口、folders は書庫の表（ワーカーブックの実のブックを引く）。
// 同じ作業を 2 つのワークルームが今の作業にしていれば、同じ実のブックが 2 つの作業机に映る
export function workdesksOf(catalog: CoreCatalog, read: RecordReader, folders: Folders): readonly Workdesk[] {
  const joined = read
    .find(PARTICIPANT.id, [{ key: "state", eq: "joined" }])
    .flatMap(r => {
      const p = PARTICIPANT.record.safeParse(r)
      return p.success && p.data.workroom !== undefined ? [{ room: p.data.workroom, at: p.data.joinedAt ?? "" }] : []
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.room.localeCompare(b.room))
  const rooms = joined.flatMap(({ room }): Workroom[] => {
    const r = WORKROOM.record.safeParse(read.record(WORKROOM.id, room))
    return r.success && r.data.id === room ? [r.data] : []
  })
  const admin = adminRoomOf(read.record(ADMIN_MARK.id, "admin") as { workroom: string } | undefined, rooms)
  const ordered = [...rooms.filter(r => r.id === admin), ...rooms.filter(r => r.id !== admin)]
  return [...new Map(ordered.map(r => [r.id, r])).values()].map(room => {
    const { workKey, title } = workerBookOf(catalog, read, room.id)
    return {
      room: room.id,
      title: room.name,
      bird: room.bird,
      palette: room.palette ?? originalPalette(room.bird),
      bookTitle: title,
      book: backyardBookOf({ folders }, TICKETS_HISTORY.id, workKey),
    }
  })
}

// ワークルーム room 自身のワーカーブック（tickets-history の中の、workKey がそのワークルームのブック）のページの数（ブックが無ければ 0）。
// 部屋を消す・引き継がずに入り直すと、このブックは完全に消える
export function ownBookPagesOf(folders: Folders, room: string): number {
  const book = backyardBookOf({ folders }, TICKETS_HISTORY.id, { subject: WORKROOM.id, id: room })
  return book === undefined ? 0 : rowsWithin(folders, book).pages.length
}
