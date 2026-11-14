// スクラップのフォームの部品: 指すページ（変えない）の全体を縮めた絵の上で、見る範囲の枠を動かし（中をドラッグ）、角と辺で大きさを変え、倍率を数で入れる。
// 決めた値は onChange で返すだけで、何のアクションを行うかは知らない（切り抜くダイアログと、置いたスクラップを直すダイアログが共に使う）。
// 範囲は、ページの中身の位置（可変ページで中身をずらす前の位置。scrap.ts）で受けて返す。絵の上ではずらした後の位置で描く。
// 指すページが無ければ、絵の代わりに No Data を出す。opens を渡せば「元のページを開く」を出し、押すとそのステージで元のページを開いてから onOpened を呼ぶ
import { type PointerEvent, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById } from "../../../core/book"
import type { Point, Rect, Size } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import { DrawnScope } from "../../../ui/drawn"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { controlClass, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { pageArea, paperSize } from "../place/items"
import styles from "./ScrapForm.module.css"
import { DrawnSheet } from "./ScrapView"
import { SCRAP_SCALE_MAX, SCRAP_SCALE_MIN, type Scrap, scrapSize } from "./scrap"

// ページの絵を収める大きさ（px）
const PICTURE = { w: 420, h: 320 }
// 範囲の一番小さい大きさ（ページの px）
const MIN_AREA = 16

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

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

// 範囲 r を、つかんだ所 grip を by だけ動かした範囲（ページ size の中に収め、一番小さい大きさを保つ）
export function movedArea(r: Rect, grip: Grip, by: Point, size: Size): Rect {
  if (grip.dx === 0 && grip.dy === 0)
    return { ...r, x: clamp(r.x + by.x, 0, size.w - r.w), y: clamp(r.y + by.y, 0, size.h - r.h) }
  let { x, y, w, h } = r
  if (grip.dx === 1) w = clamp(w + by.x, MIN_AREA, size.w - x)
  if (grip.dx === -1) {
    const left = clamp(x + by.x, 0, x + w - MIN_AREA)
    w += x - left
    x = left
  }
  if (grip.dy === 1) h = clamp(h + by.y, MIN_AREA, size.h - y)
  if (grip.dy === -1) {
    const top = clamp(y + by.y, 0, y + h - MIN_AREA)
    h += y - top
    y = top
  }
  return { x, y, w, h }
}

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })

export function ScrapForm({
  value,
  onChange,
  opens,
}: {
  value: Scrap
  onChange: (next: Scrap) => void
  opens?: { stage: string; onOpened: () => void }
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { openBook, openPage } = useActions()
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
  const paper = page ? paperSize(catalog, page) : null
  // ページの絵の上の位置 = 範囲 + ずらした量
  const shift = { x: (page?.shift?.x ?? 0) * (paper?.w ?? 0), y: (page?.shift?.y ?? 0) * (paper?.h ?? 0) }
  const fit = size ? Math.min(PICTURE.w / size.w, PICTURE.h / size.h) : 1
  const drag = useRef<{ grip: Grip; from: Point; start: Rect; pointer: number } | null>(null)
  const [scaleText, setScaleText] = useState(String(Math.round(value.scale * 100)))
  const shown = { ...value.area, x: value.area.x + shift.x, y: value.area.y + shift.y }
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
    const next = round(movedArea(d.start, d.grip, by, size))
    onChange({ ...value, area: { ...next, x: next.x - shift.x, y: next.y - shift.y } })
  }
  const release = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer === e.pointerId) drag.current = null
  }
  const placed = scrapSize(value)
  return (
    <div className={styles.form}>
      <div
        className={styles.picture}
        style={size ? { width: size.w * fit, height: size.h * fit } : { width: PICTURE.w, height: PICTURE.h }}
      >
        {book && page && size ? (
          <>
            <DrawnScope catalog={catalog} book={book} page={page} zoom={fit}>
              {stage => (
                <div className={styles.scaled} style={{ transform: `scale(${fit})` }}>
                  <DrawnSheet stage={stage} book={book} page={page} size={size} onSize={setDrawn} />
                </div>
              )}
            </DrawnScope>
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
      <div className={styles.side}>
        <label className={rowClass}>
          <span>{t("Scrap scale")}</span>
          <input
            className={`${controlClass} ${styles.scale}`}
            type="number"
            min={SCRAP_SCALE_MIN * 100}
            max={SCRAP_SCALE_MAX * 100}
            step={1}
            value={scaleText}
            onChange={e => {
              setScaleText(e.target.value)
              const n = Number(e.target.value) / 100
              if (e.target.value !== "" && n >= SCRAP_SCALE_MIN && n <= SCRAP_SCALE_MAX)
                onChange({ ...value, scale: n })
            }}
          />
          <span>%</span>
        </label>
        <div className={rowClass}>
          <span>{t("Scrap size")}</span>
          <span data-scrap-size>
            {placed.w} × {placed.h}
          </span>
        </div>
        {opens && book && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              openBook(opens.stage, book.id)
              openPage(opens.stage, value.page)
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
