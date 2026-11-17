// チケットスクリーンでチケットを開く関数を返すフック。描いている場所のスクリーン（スクリーンの外なら、カレントスクリーン）から開く。
// - card: チケットカード。そのチケットを上下に分けて見せていれば閉じる。コントロールセンターからは、下に分けて開く（分けていれば、コントロールセンターの代わりに上に入る）。
//   全画面のチケットスクリーンからは中身だけ替え、ブックスクリーンからは全画面で開く
// - hit: 横断検索の当たり。カードと同じだが、上下に分けて見せているチケットは閉じずに、その段をカレントにする
// - here: 「開く」。今のスクリーンがチケットスクリーンなら、スクリーンは積まずに中身のチケットだけ替える（ブラウザの履歴には積むので、戻ると前のチケットに戻る）
// - beside: 「分割して開く」。分けていれば、もう片方の段に入れ（そこにあった物は閉じる）、分けていなければ上に入れて分ける
// 分けられない（窓が低い）ときは、どれも全画面で開く
import { useScreens } from "../../../plugin-api/ui"
import { BOOK_SCREEN, useScreenSplit } from "../../base/ui"
import { TICKET_SCREEN } from "."

export interface TicketOpener {
  card(ticket: string): void
  hit(ticket: string): void // 横断検索の当たり: カードと同じ開き方。ただし、上下に分けて見せているチケットは閉じずに、その段をカレントにする
  here(ticket: string): void
  beside(ticket: string): void
  shown(ticket: string): boolean // そのチケットを上下に分けて見せているか
  tall: boolean // 分けて開けるか（窓の高さが足りるか）
}

// 一緒に並べるチケットスクリーンの枚数
const PAIR = 2

// チケットカード・横断検索の当たりの開き方: close（分けて見せているので閉じる）・full（全画面で開く）・replace（今のチケットスクリーンの中身を替える）・
// in-place（分けた並びの、起点の代わりに入れる）・after（起点の下に入れて分ける）
export type CardWay = "close" | "full" | "replace" | "in-place" | "after"
export function cardWay(here: string, shown: boolean, inSplit: boolean): CardWay {
  if (shown) return "close"
  if (here === BOOK_SCREEN) return "full"
  if (here === TICKET_SCREEN.id && !inSplit) return "replace"
  return inSplit ? "in-place" : "after"
}

// 「分割して開く」の入れる所: 分けていなければ起点の上、分けていれば、もう片方の段（起点が上なら下、下なら上）
export const besideWay = (inSplit: boolean, index: number): "before" | "after" =>
  !inSplit || index > 0 ? "before" : "after"

export function useOpenTicket(): TicketOpener {
  const { open, setProps } = useScreens()
  const split = useScreenSplit()
  const opening = (ticket: string) => ({ def: TICKET_SCREEN, props: { ticket } })
  const replace = (ticket: string) => {
    if (split.here.def === TICKET_SCREEN.id) setProps(split.here.id, TICKET_SCREEN, { ticket })
    else open(TICKET_SCREEN, { ticket })
  }
  const card = (ticket: string) => {
    const way = cardWay(split.here.def, split.has(TICKET_SCREEN, { ticket }), split.inSplit)
    if (way === "close") split.closeOf(TICKET_SCREEN, { ticket })
    else if (way === "full") open(TICKET_SCREEN, { ticket })
    else if (way === "replace") replace(ticket)
    else split.open(opening(ticket), way, PAIR)
  }
  return {
    tall: split.tall,
    shown: ticket => split.has(TICKET_SCREEN, { ticket }),
    card,
    hit: ticket => {
      if (split.has(TICKET_SCREEN, { ticket })) split.showOf(TICKET_SCREEN, { ticket })
      else card(ticket)
    },
    here: replace,
    beside: ticket => split.open(opening(ticket), besideWay(split.inSplit, split.index), PAIR),
  }
}
