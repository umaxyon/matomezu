// 参加者の様子の見方: モデルは、AI のフックが知らせた物（今のモデル）を、参加を頼んだときのモデル（参加者のレコード）より先に見る
import type { ParticipantLive } from "../../../store/state"
import type { Participant } from "."

// 画面に出す参加者のモデル。live はその参加者の様子（知らされていなければ undefined）
export const shownModel = (participant: Participant, live: ParticipantLive | undefined): string =>
  live?.model || participant.model
