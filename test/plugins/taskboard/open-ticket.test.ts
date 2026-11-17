// チケットを開く道: チケットカード・横断検索の当たりの開き方と、「分割で開く」の入れる所
import { expect, test } from "bun:test"
import { BOOK_SCREEN } from "../../../web/src/plugins/base/ui"
import { TICKET_SCREEN } from "../../../web/src/plugins/taskboard/ticket-screen"
import { besideWay, cardWay, hitWay } from "../../../web/src/plugins/taskboard/ticket-screen/useOpenTicket"

const CENTER = "@matomezu/control-center:screen"

test("カードの開き方: 分けて見せていれば閉じ、ブックスクリーンからは全画面、全画面のチケットからは中身を替え、ほかは分ける", () => {
  const rows: [string, boolean, boolean, string][] = [
    [CENTER, true, true, "close"],
    [BOOK_SCREEN, false, false, "full"],
    [TICKET_SCREEN.id, false, false, "replace"],
    [TICKET_SCREEN.id, false, true, "in-place"],
    [CENTER, false, true, "in-place"],
    [CENTER, false, false, "after"],
  ]
  for (const [here, shown, inSplit, way] of rows) expect(cardWay(here, shown, inSplit)).toBe(way as never)
})

test("「分割で開く」は、分けていなければ上、分けていれば、もう片方の段", () => {
  expect(besideWay(false, -1)).toBe("before")
  expect(besideWay(true, 0)).toBe("after")
  expect(besideWay(true, 1)).toBe("before")
})

test("横断検索の当たり: 分けて見せていればその段へ、分けていれば上下を選ばせ、窓が高く全画面のチケットからは開き方を選ばせ、ほかはカードと同じ", () => {
  const rows: [string, boolean, boolean, boolean, string][] = [
    [CENTER, true, true, true, "show"],
    [CENTER, false, true, true, "rows"],
    [TICKET_SCREEN.id, false, true, true, "rows"],
    [TICKET_SCREEN.id, false, false, true, "choose"],
    [TICKET_SCREEN.id, false, false, false, "card"],
    [CENTER, false, false, true, "card"],
    [BOOK_SCREEN, false, false, true, "card"],
  ]
  for (const [here, shown, inSplit, tall, way] of rows) expect(hitWay(here, shown, inSplit, tall)).toBe(way as never)
})
