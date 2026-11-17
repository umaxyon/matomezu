// チケットスクリーンでチケットを開く関数を返すフック。描いている場所のスクリーン（スクリーンの外なら、カレントスクリーン）から開く。
// - card: チケットカードと横断検索の当たり。そのチケットを上下に分けて見せていれば閉じる。コントロールセンターからは、下に分けて開く（分けていれば、コントロールセンターの代わりに上に入る）。
//   全画面のチケットスクリーンからは中身だけ替え、ブックスクリーンからは全画面で開く
// - here: 「開く」。今のスクリーンがチケットスクリーンなら、スクリーンは積まずに中身のチケットだけ替える（ブラウザの履歴には積むので、戻ると前のチケットに戻る）
// - beside: 「分割して開く」。分けていれば、もう片方の段に入れ（そこにあった物は閉じる）、分けていなければ上に入れて分ける
// 分けられない（窓が低い）ときは、どれも全画面で開く
import { useScreens } from "../../../plugin-api/ui"
import { BOOK_SCREEN, useScreenSplit } from "../../base/ui"
import { TICKET_SCREEN } from "."

export interface TicketOpener {
  card(ticket: string): void
  here(ticket: string): void
  beside(ticket: string): void
  shown(ticket: string): boolean // そのチケットを上下に分けて見せているか
  tall: boolean // 分けて開けるか（窓の高さが足りるか）
}

// 一緒に並べるチケットスクリーンの枚数
const PAIR = 2

export function useOpenTicket(): TicketOpener {
  const { screens, open, setProps } = useScreens()
  const split = useScreenSplit()
  const here = screens.find(s => s.current)
  const opening = (ticket: string) => ({ def: TICKET_SCREEN, props: { ticket } })
  const replace = (ticket: string) => {
    if (here?.def === TICKET_SCREEN.id) setProps(here.id, TICKET_SCREEN, { ticket })
    else open(TICKET_SCREEN, { ticket })
  }
  return {
    tall: split.tall,
    shown: ticket => split.has(TICKET_SCREEN, { ticket }),
    card: ticket => {
      if (split.has(TICKET_SCREEN, { ticket })) return split.closeOf(TICKET_SCREEN, { ticket })
      if (here?.def === BOOK_SCREEN) return open(TICKET_SCREEN, { ticket })
      if (here?.def === TICKET_SCREEN.id && !split.inSplit) return replace(ticket)
      split.open(opening(ticket), split.inSplit ? "in-place" : "after", PAIR)
    },
    here: replace,
    beside: ticket => {
      const how = !split.inSplit || split.index > 0 ? "before" : "after"
      split.open(opening(ticket), how, PAIR)
    },
  }
}
