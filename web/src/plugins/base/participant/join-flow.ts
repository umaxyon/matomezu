// 参加者リストの操作を、アクション 1 件ずつ続けて行う（アクションが変えるレコードは 1 件なので、続けて行う）。
// 途中で断られたら、そこで止めて断りを返す（途中で止まっても、空室が残るなど、状態は壊れない）。
// 順番: ワークルームに人がいると participant-accept も workroom-remove も断るので、いる参加者を先に消す
import { PARTICIPANT_ACCEPT, PARTICIPANT_REMOVE, WORKROOM_ADD, WORKROOM_REMOVE } from "."

// アクションを 1 件行う関数（useActions の perform）。成功なら ok が true で result を持ち、断られたら ok が false
type Do = (id: string, args: object, on?: { record: string }) => { ok: boolean; result?: unknown }

export interface NewRoom {
  name: string
  bird: string
  palette?: string | undefined
}

const roomOf = (done: { result?: unknown }): string =>
  (done.result as { workroom?: string } | undefined)?.workroom ?? ""

// 新しいワークルームを作って、要求中の参加者 participant を入れる
export function acceptInNewRoom(perform: Do, participant: string, room: NewRoom) {
  const made = perform(WORKROOM_ADD.id, room)
  if (!made.ok) return made
  return perform(PARTICIPANT_ACCEPT.id, { workroom: roomOf(made) }, { record: participant })
}

// 今あるワークルーム room に、要求中の参加者 participant を入れる（いる参加者 occupant があれば、先に外す）
export function acceptInRoom(perform: Do, participant: string, room: string, occupant?: string) {
  if (occupant !== undefined) {
    const left = perform(PARTICIPANT_REMOVE.id, {}, { record: occupant })
    if (!left.ok) return left
  }
  return perform(PARTICIPANT_ACCEPT.id, { workroom: room }, { record: participant })
}

// ワークルーム room（いる参加者 occupant があれば先に外す）を消して、同じ名前の新しいワークルームを作り、要求中の参加者 participant を入れる
export function discardAndStart(perform: Do, participant: string, room: string, newRoom: NewRoom, occupant?: string) {
  if (occupant !== undefined) {
    const left = perform(PARTICIPANT_REMOVE.id, {}, { record: occupant })
    if (!left.ok) return left
  }
  const gone = perform(WORKROOM_REMOVE.id, {}, { record: room })
  if (!gone.ok) return gone
  return acceptInNewRoom(perform, participant, newRoom)
}

// ワークルーム room を消す（いる参加者 occupant があれば先に外す）
export function deleteRoom(perform: Do, room: string, occupant?: string) {
  if (occupant !== undefined) {
    const left = perform(PARTICIPANT_REMOVE.id, {}, { record: occupant })
    if (!left.ok) return left
  }
  return perform(WORKROOM_REMOVE.id, {}, { record: room })
}
