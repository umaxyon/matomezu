// バックヤード: base の tickets-history（AI の作業の資料のブックを、作業ごとに 1 冊ずつ置く所。チケットの全文で AI に見せる）。足りない行を足すのは、core の読む関数（core/unreadable.ts の settleLibrary）

import { kit } from "../kit"

export const TICKETS_HISTORY = kit.defineBackyard({ id: "tickets-history", aiShown: true })
