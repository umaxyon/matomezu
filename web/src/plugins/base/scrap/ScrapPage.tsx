// スクラップの中: ページ page（id だけで指す）の範囲 area を、倍率 scale で描く（枠の大きさは area × scale）。ページを、そのページのブックの見た目で、見るだけに描く
// （描いているページ。ui/drawn.tsx）。指す先のページが無ければ「無い」、スクラップをたどって同じページに戻ったら「輪」を描く。
// 範囲は可変ページの中身の位置で持つ（中身を右・下へずらしたら、ずらした分だけ先を描く）
import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById } from "../../../core/book"
import type { Point, Rect, Size } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import type { Book, Page } from "../../../core/schema/book"
import { DrawnScope } from "../../../ui/drawn"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useBookLookStyle } from "../book-look/use-book-look-style"
import { pageArea, paperSize } from "../place/items"
import { Printing } from "../print-preview/printing"
import { SheetLayers } from "../print-preview/SheetLayers"
import styles from "./ScrapPage.module.css"

// 描いている途中のスクラップがたどったページの id。同じページに戻ったら輪
const TracedContext = createContext<readonly string[]>([])

export interface ScrapPageProps {
  page: string // 指すページの id
  area: Rect // 描く範囲（ページの中身の位置。紙の左上が 0）
  scale: number // 倍率
  zoom?: number // 枠を描く所の倍率（ステージの倍率など。中の物が画面の上で一定に描く線などに使う。無ければ 1）
}

export type ScrapState = "shown" | "none" | "loop"

// 範囲 area を、ページのずらした量 shift（印刷区画の数）だけ動かした、ページの上の位置
const shifted = (area: Rect, shift: Point | undefined, paper: Size): Point => ({
  x: area.x + (shift?.x ?? 0) * paper.w,
  y: area.y + (shift?.y ?? 0) * paper.h,
})

export function ScrapPage({ page: pageId, area, scale, zoom = 1 }: ScrapPageProps) {
  const catalog = useCatalog().core
  const traced = useContext(TracedContext)
  // ページの見た目と設定は、今そのページを持っているブックから引く
  const found = useMatomezuState(
    useShallow(s => {
      const at = pageById(s.books, pageId)
      return { book: at?.book ?? null, page: (at?.page as ItemPage | undefined) ?? null }
    }),
  )
  const { book, page } = found
  const state: ScrapState = !book || !page ? "none" : traced.includes(pageId) ? "loop" : "shown"
  const frame = { width: area.w * scale, height: area.h * scale }
  const size = book && page ? pageArea(catalog, book, page)?.size : undefined
  const paper = page ? paperSize(catalog, page) : null
  const inner = useMemo(() => [...traced, pageId], [traced, pageId])
  if (state !== "shown" || !book || !page || !size || !paper)
    return <div className={styles.frame} data-scrap={state === "loop" ? "loop" : "none"} style={frame} />
  const at = shifted(area, page.shift, paper)
  return (
    <div className={styles.frame} data-scrap="shown" style={frame}>
      <TracedContext.Provider value={inner}>
        <DrawnScope catalog={catalog} book={book} page={page} zoom={zoom * scale}>
          {stage => (
            <div className={styles.moved} style={{ transform: `scale(${scale}) translate(${-at.x}px, ${-at.y}px)` }}>
              <DrawnSheet stage={stage} book={book} page={page} size={size} />
            </div>
          )}
        </DrawnScope>
      </TracedContext.Provider>
    </div>
  )
}

// 描いているページ stage の中身: ページの広さ size のまま、そのブックの見た目で、印刷区画 1 つのビューを並べたレイヤー（sheet-layers）を描く
export function DrawnSheet({
  stage,
  book,
  page,
  size,
  children,
}: {
  stage: string
  book: Book
  page: Page
  size: Size
  children?: ReactNode
}) {
  const look = useBookLookStyle(stage, book.type)
  return (
    <div className={styles.sheet} style={{ ...look, width: size.w, height: size.h }}>
      <Printing>
        <SheetLayers stage={stage} book={book} page={page} column={0} row={0} paper={size} />
      </Printing>
      {children}
    </div>
  )
}
