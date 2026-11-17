// チケットスクリーンでチケットを開く関数を返すフック。描いている場所のスクリーン（スクリーンの外なら、カレントスクリーン）から開く。
// - card: チケットカード。そのチケットを上下に分けて見せていれば閉じる。コントロールセンターからは、下に分けて開く（分けていれば、コントロールセンターの代わりに上に入る）。
//   全画面のチケットスクリーンからは中身だけ替え、ブックスクリーンからは全画面で開く
// - hit: 横断検索の当たり（hitWay）。上下に分けて見せているチケットは閉じずにその段をカレントにする。分けている間は「上に開く／下に開く」、
//   全画面のチケットからは「開く／分割で開く」を選ばせる（選ぶ物を返す）。ほかはカードと同じ
// - here: 「開く」。今のスクリーンがチケットスクリーンなら、スクリーンは積まずに中身のチケットだけ替える（ブラウザの履歴には積むので、戻ると前のチケットに戻る）
// - beside: 「分割で開く」。分けていれば、もう片方の段に入れ（そこにあった物は閉じる）、分けていなければ上に入れて分ける
// 分けられない（窓が低い）ときは、どれも全画面で開く
import { useMessages, useScreens } from "../../../plugin-api/ui"
import { BOOK_SCREEN, useScreenSplit, type WideSearchOpened } from "../../base/ui"
import { kit } from "../kit"
import { TICKET_SCREEN } from "."

export interface TicketOpener {
  card(ticket: string): void
  hit(ticket: string): WideSearchOpened // 横断検索の当たり: 開いたか、開き方を選ばせる物の並び
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

// 横断検索の当たりの開き方: show（分けて見せているので、その段をカレントにする）・rows（「上に開く／下に開く」を選ばせる）・
// choose（「開く／分割で開く」を選ばせる）・card（カードと同じ）
export type HitWay = "show" | "rows" | "choose" | "card"
export function hitWay(here: string, shown: boolean, inSplit: boolean, tall: boolean): HitWay {
  if (shown) return "show"
  if (inSplit) return "rows"
  if (here === TICKET_SCREEN.id && tall) return "choose"
  return "card"
}

// 「分割で開く」の入れる所: 分けていなければ起点の上、分けていれば、もう片方の段（起点が上なら下、下なら上）
export const besideWay = (inSplit: boolean, index: number): "before" | "after" =>
  !inSplit || index > 0 ? "before" : "after"

export function useOpenTicket(): TicketOpener {
  const t = useMessages(kit)
  const { open, setProps } = useScreens()
  const split = useScreenSplit()
  const opening = (ticket: string) => ({ def: TICKET_SCREEN, props: { ticket } })
  const replace = (ticket: string) => {
    if (split.here.def === TICKET_SCREEN.id) setProps(split.here.id, TICKET_SCREEN, { ticket })
    else open(TICKET_SCREEN, { ticket })
  }
  const beside = (ticket: string) => split.open(opening(ticket), besideWay(split.inSplit, split.index), PAIR)
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
      const way = hitWay(split.here.def, split.has(TICKET_SCREEN, { ticket }), split.inSplit, split.tall)
      if (way === "rows")
        return [
          { label: t("Open on top"), onPick: () => split.openAt(opening(ticket), 0) },
          { label: t("Open below"), onPick: () => split.openAt(opening(ticket), split.count - 1) },
        ]
      if (way === "choose")
        return [
          { label: t("Open"), onPick: () => replace(ticket) },
          { label: t("Open split"), onPick: () => beside(ticket) },
        ]
      if (way === "show") split.showOf(TICKET_SCREEN, { ticket })
      else card(ticket)
      return "opened"
    },
    here: replace,
    beside,
  }
}
