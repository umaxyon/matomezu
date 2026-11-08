// 参加要求を受け入れるダイアログ（ワークルームの名前・鳥・配色を決める）の id。参加者の id を受け取る
import { kit } from "../kit"

export const PARTICIPANT_JOIN_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "participant-join" })
