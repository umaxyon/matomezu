// 参加者のダイアログの id（参加要求・受け入れ・ようこそは参加者の id を、承認待ちの確認は AI 間メッセージの id を受け取る）
import { kit } from "../kit"

// 参加要求のダイアログ（要求の中身と、断る・受け入れる。しおりから開く）
export const JOIN_REQUEST_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "join-request" })

// 参加要求を受け入れるダイアログ（ワークルームの名前・鳥・配色を決める）
export const PARTICIPANT_JOIN_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "participant-join" })

// 受け入れた参加者を知らせる、ようこそのダイアログ（受け入れたら受け入れのダイアログに替えて出す）
export const PARTICIPANT_WELCOME_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "participant-welcome" })

// 承認待ちの AI 間メッセージの確認のダイアログ（承認・キャンセル。参加者リストの吹き出しから開く）
export const PENDING_MESSAGE_DIALOG = kit.defineDialogWith<{ message: string }>()({ id: "pending-message" })
