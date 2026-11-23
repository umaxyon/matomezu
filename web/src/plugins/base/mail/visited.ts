// 郵便の行き先が画面に出ているか（行き先を見たかの見張り MailWatch が使う。表示領域に入ったかを測るのは見張りの側で、ここは決めるだけ）
import type { NO_PAGE } from "../../../core/stage"
import type { Mail } from "./mail"

// 開いているステージ（ステージの id と、開いているブック・ページ。ページを開いていなければ page は NO_PAGE）
export interface OpenedStage {
  id: string
  book: string
  page: string | typeof NO_PAGE
}

// 郵便 m の行き先が、ステージ stages のどれかに出ているか: そのブックのそのページを開いていて、物があればその物が表示領域に入っている（入っているかは shows が答える）
export function placeShown(
  m: Mail,
  stages: readonly OpenedStage[],
  shows: (stage: string, id: string) => boolean,
): boolean {
  const to = m.to
  if (!to) return false
  return stages.some(
    st => st.book === to.book && (!to.page || st.page === to.page) && (!to.ids || to.ids.some(id => shows(st.id, id))),
  )
}
