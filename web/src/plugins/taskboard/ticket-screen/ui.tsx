// チケットスクリーンを描くウィジェット。チケットスクリーンの定義（index.ts の TICKET_SCREEN）の id と同じ名前のスロットに置く
import { defineWidget } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { TICKET_SCREEN } from "."
import { TicketScreen } from "./TicketScreen"

export const TICKET_SCREEN_VIEW = defineWidget({
  id: kit.name("ticket-screen-view"),
  slots: [TICKET_SCREEN.id],
  view: TicketScreen,
})
