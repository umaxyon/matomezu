// チケットスクリーンの定義: コントロールセンターの画面に重ねるスクリーン。開くときの値はチケットの id（useOpenScreen の open に { ticket } を渡す）
import { defineScreen } from "../base/ui"
import { kit } from "./kit"
import { TicketScreen } from "./TicketScreen"
import { TICKET_SCREEN_PROPS } from "./ticket-screen-props"

export const TICKET_SCREEN = defineScreen({
  id: kit.name("ticket-screen"),
  props: TICKET_SCREEN_PROPS,
  view: TicketScreen,
})
