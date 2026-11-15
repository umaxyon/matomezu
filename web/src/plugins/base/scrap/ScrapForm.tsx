// スクラップのフォームの部品: 指すページ（変えない）の全体を、置かれた所の広さに収めた絵の上で、見る範囲の枠を動かし（中をドラッグ）、角と辺で大きさを変える（倍率はここでは変えない。置いた形のつまみで変える）。
// 決めた値は onChange で返すだけで、何のアクションを行うかは知らない（切り抜くダイアログと、置いたスクラップを直すダイアログが共に使う）。
// 範囲は、ページの中身の位置（可変ページで中身をずらす前の位置。scrap.ts）で受けて返す。絵の上ではずらした後の位置で描く。
// 指すページが無ければ、絵の代わりに No Data を出す。opens を渡せば「元のページを開く」を出し、押すとそのステージで元のページを開いてから onOpened を呼ぶ
import { type PointerEvent, type ReactNode, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById } from "../../../core/book"
import type { Point, Rect, Size } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import { useMessages } from "../../../ui/i18n"
import { PageScope } from "../../../ui/scope"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { pageArea } from "../place/items"
import { useResize } from "../utils/useResize"
import styles from "./ScrapForm.module.css"
import { DrawnSheet } from "./ScrapView"
import { areaOfPage, areaOnPage, movedArea, type Scrap, shiftOf } from "./scrap"

// ページの絵を収める大きさ（px。置かれた所の広さを測れるまで）
const PICTURE = { w: 420, h: 320 }
// つかんだ所: 枠の中（動かす）か、辺・角（その向きへ大きさを変える）
type Grip = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
const GRIPS: readonly Grip[] = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
]
const MOVE: Grip = { dx: 0, dy: 0 }

export function ScrapForm({
  value,
  onChange,
  opens,
  side,
}: {
  value: Scrap
  onChange: (next: Scrap) => void
  side?: ReactNode // 絵の右の列に置く物（使う側の設定の入力Form など）
  opens?: { stage: string; onOpened: () => void; edited: boolean } // edited: 使う側の値を直したか（直した後は開けない。直した分を黙って捨てないため）
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { openPageById } = useActions()
  const found = useMatomezuState(
    useShallow(s => {
      const at = pageById(s.books, value.page)
      return { book: at?.book ?? null, page: (at?.page as ItemPage | undefined) ?? null }
    }),
  )
  const { book, page } = found
  const area = book && page ? pageArea(catalog, book, page)?.size : undefined
  // 測ってから描く見せ方は、描いてみて分かった広さ（DrawnSheet が知らせる）
  const [drawn, setDrawn] = useState<Size | null>(null)
  const size = drawn ?? area
  // ページの絵の上の位置 = 範囲 + ずらした量
  const shift = page ? shiftOf(catalog, page) : { x: 0, y: 0 }
  // 絵を収める広さ: 絵を置く所（フォームの残りの広さ）を測る
  const room = useRef<HTMLDivElement | null>(null)
  const [picture, setPicture] = useState<Size>(PICTURE)
  useResize(room, setPicture)
  const fit = size ? Math.min(picture.w / size.w, picture.h / size.h) : 1
  const drag = useRef<{ grip: Grip; from: Point; start: Rect; pointer: number } | null>(null)
  const shown = areaOnPage(value.area, shift)
  const press = (grip: Grip) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { grip, from: { x: e.clientX, y: e.clientY }, start: shown, pointer: e.pointerId }
  }
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId || !size) return
    const by = { x: (e.clientX - d.from.x) / fit, y: (e.clientY - d.from.y) / fit }
    onChange({ ...value, area: areaOfPage(movedArea(d.start, d.grip, by, size), shift) })
  }
  const release = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer === e.pointerId) drag.current = null
  }
  return (
    <div className={styles.form}>
      <div ref={room} className={styles.room}>
        <div
          className={styles.picture}
          style={size ? { width: size.w * fit, height: size.h * fit } : { width: PICTURE.w, height: PICTURE.h }}
        >
          {book && page && size ? (
            <>
              <PageScope book={book.id} page={page.id} zoom={fit}>
                <div className={styles.scaled} style={{ transform: `scale(${fit})` }}>
                  <DrawnSheet book={book} page={page} size={size} onSize={setDrawn} />
                </div>
              </PageScope>
              <div
                className={styles.area}
                data-scrap-area
                style={{ left: shown.x * fit, top: shown.y * fit, width: shown.w * fit, height: shown.h * fit }}
                onPointerDown={press(MOVE)}
                onPointerMove={move}
                onPointerUp={release}
                onPointerCancel={release}
              >
                {GRIPS.map(g => (
                  <div
                    key={`${g.dx},${g.dy}`}
                    className={styles.grip}
                    data-grip={`${g.dx},${g.dy}`}
                    style={{ left: `${(g.dx + 1) * 50}%`, top: `${(g.dy + 1) * 50}%` }}
                    onPointerDown={press(g)}
                    onPointerMove={move}
                    onPointerUp={release}
                    onPointerCancel={release}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className={styles.none}>{t("No Data")}</div>
          )}
        </div>
      </div>
      <div className={styles.side}>
        {side}
        {opens && book && (
          <button
            type="button"
            className={styles.link}
            disabled={opens.edited}
            title={opens.edited ? t("Decide or cancel the changes first") : undefined}
            onClick={() => {
              openPageById(opens.stage, value.page)
              opens.onOpened()
            }}
          >
            {t("Open the original page")} →
          </button>
        )}
      </div>
    </div>
  )
}
