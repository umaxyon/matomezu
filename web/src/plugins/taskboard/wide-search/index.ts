// 横断検索のチケットの絞りの、窓の中の画面の状態（読み直すと消える）
import { kit } from "../kit"
import type { TicketFilter } from "./filter"

export const TICKET_FILTER = kit.definePluginStateOf<TicketFilter>()({ id: "ticket-filter", scope: "window" })
