// 参加要求の見張り（ウィジェット join-request-watch。根に置き、何も描かない）: 要求中の参加者が増えたら、要求の題のマーキーを出す（届いた物のマーキー）

import { kit } from "../kit"
import { NO_MARQUEE, useArrivalMarquee } from "../utils/arrival-marquee"
import { useParticipants } from "./hooks"

export function JoinRequestWatch() {
  useArrivalMarquee(useParticipants(), came =>
    came.some(p => p.state === "requested")
      ? { message: kit.message("A join request arrived from an AI agent"), params: {} }
      : NO_MARQUEE,
  )
  return null
}
