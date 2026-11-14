// チケットスクリーンでチケット ticket を開く関数を返すフック（横断検索の当たりと、本文・履歴の文のチケットの番号が使う）。
// 今のスクリーンがチケットスクリーンなら、積まずに中身のチケットだけ替える（戻る矢印 1 回で前のスクリーンに戻る。元のチケットへ戻る道は無い）
import { useScreens } from "../../../plugin-api/ui"
import { TICKET_SCREEN } from "."

export function useOpenTicket(): (ticket: string) => void {
  const { screens, open, setProps } = useScreens()
  return ticket => {
    const here = screens.find(s => s.current)
    if (here?.def === TICKET_SCREEN.id) setProps(here.id, TICKET_SCREEN, { ticket })
    else open(TICKET_SCREEN, { ticket })
  }
}
