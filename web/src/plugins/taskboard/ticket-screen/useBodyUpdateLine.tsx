// チケット履歴の「本文更新」の行を、利用者がチケットスクリーンから離れたときに 1 行だけ足す（本文は打つたびに反映するので、1 字ごとには足さない）。
// 足すのは、この画面で本文を直したときだけ（markEdited を呼んだとき。AI やほかの窓が直した分は足さない）。開いているチケットが替わるときも離れたものとして足す。
// 書いた者は行ったアクターの利用者（行う側が決める）。本文を直さずに離れたときは足さない
import { useCallback, useEffect, useRef } from "react"
import { useActions } from "../../../plugin-api/ui"
import { TOPIC_BODY } from "../ticket-history"
import { TICKET_HISTORY_ADD } from "../ticket-history/actions"

// 開いているチケット ticket（無ければ undefined）の、離れたときに足す関数 markEdited（本文を直したと知らせる）を返す
export function useBodyUpdateLine(ticket: string | undefined): () => void {
  const { perform } = useActions()
  const act = useRef(perform)
  act.current = perform
  const edited = useRef(false)
  useEffect(() => {
    edited.current = false
    return () => {
      if (ticket && edited.current) act.current(TICKET_HISTORY_ADD.id, { ticket, topic: TOPIC_BODY.id, text: "" })
      edited.current = false
    }
  }, [ticket])
  return useCallback(() => {
    edited.current = true
  }, [])
}
