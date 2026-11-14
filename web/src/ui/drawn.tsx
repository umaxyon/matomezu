// ステージの id が指す物: 窓のステージか、ステージの外で、見るだけに描くページ。
// ページ一覧のサムネイルのように、ステージの外でページを描く所は、窓に無い id を作り、DrawnScope でその id にページを結んで、中の物に渡す。
// ステージの id から、開いているブック・ページ・倍率・選択などを引く所は、stageFor で引く（窓のステージより、見るだけに描くページを先に見る）。
// ステージの外で、見るだけに描くページは選択も編集も無く、アクションもコマンドも行わない（窓のステージでないので、書く側の操作は宛先が無い）
import { createContext, type ReactNode, useContext, useId, useMemo } from "react"
import type { PagedBook } from "../core/book"
import type { CoreCatalog } from "../core/core-catalog"
import type { Page } from "../core/schema/book"
import { newStage, openedAt, type Stage } from "../core/stage"
import { stageIn, type WindowState } from "../core/window"

const NO_DRAWN: ReadonlyMap<string, Stage> = new Map()
const DrawnContext = createContext<ReadonlyMap<string, Stage>>(NO_DRAWN)

// ステージの id から、ステージの外で、見るだけに描くページ（この中で描いていなければ undefined）
export const useDrawn = (stage: string): Stage | undefined => useContext(DrawnContext).get(stage)

// ステージの id が指す物: ステージの外で、見るだけに描くページ drawn があればそれ、無ければ窓のステージ
export const stageFor = (
  win: Pick<WindowState, "screens">,
  drawn: Stage | undefined,
  stage: string,
): Stage | undefined => drawn ?? stageIn(win, stage)

// ステージの外で、見るだけに描くページ: ブック book のページ page を、倍率 zoom（画面の 1px に描く紙の大きさの比）で見るだけに描く
export function drawnStage(catalog: CoreCatalog, id: string, book: PagedBook, page: Page, zoom: number): Stage {
  return { ...newStage(id, openedAt(catalog, book, page)), zoom }
}

// 中の物に、窓に無いステージの id を渡して、その id にページを結ぶ。children は、結んだ id を受けて描く
export function DrawnScope({
  catalog,
  book,
  page,
  zoom,
  children,
}: {
  catalog: CoreCatalog
  book: PagedBook
  page: Page
  zoom: number
  children: (stage: string) => ReactNode
}) {
  const id = `drawn:${useId()}`
  const outer = useContext(DrawnContext)
  const stage = useMemo(() => drawnStage(catalog, id, book, page, zoom), [catalog, id, book, page, zoom])
  const drawn = useMemo(() => new Map([...outer, [id, stage]]), [outer, id, stage])
  return <DrawnContext.Provider value={drawn}>{children(id)}</DrawnContext.Provider>
}
