// 選んだスライドのアイテムの上に出す物: 枠線・四隅と四辺のつまみ・回すつまみ（右上の角の斜め外）と、すぐ上（上が足りなければ下）に浮かぶバー（比率の固定・元の比率に・角度）。
// 枠とつまみは、アイテムと同じ位置・大きさ・角度でかける。大きさは画面の上で一定にする（紙の倍率 --paper-zoom で割る）。バーは傾けず、傾けた枠が収まる四角の上に出す
import { useState } from "react"
import type { Rect } from "../../../plugin-api"
import { useCommand, useMessages } from "../../../plugin-api/ui"
import { SLIDE_RESET, SLIDE_SET } from "./commands"
import { kit } from "./kit"
import { cornersOf, normalizeAngle } from "./rect"
import styles from "./Selection.module.css"

export const GRIPS = [
  { id: "top-left", at: [0, 0], grip: { left: true, top: true } },
  { id: "top", at: [50, 0], grip: { top: true } },
  { id: "top-right", at: [100, 0], grip: { right: true, top: true } },
  { id: "right", at: [100, 50], grip: { right: true } },
  { id: "bottom-right", at: [100, 100], grip: { right: true, bottom: true } },
  { id: "bottom", at: [50, 100], grip: { bottom: true } },
  { id: "bottom-left", at: [0, 100], grip: { left: true, bottom: true } },
  { id: "left", at: [0, 50], grip: { left: true } },
] as const

// ratio は置いたときの幅 ÷ 高さ、locked は比率を固定しているか
export interface SelectedItem {
  id: string
  stage: string
  rect: Rect
  rotation: number
  locked: boolean
  ratio: number | undefined
}

export function Selection({ item, hidden }: { item: SelectedItem; hidden: boolean }) {
  const { rect, rotation } = item
  const t = useMessages(kit)
  return (
    <>
      {!hidden && (
        <div
          className={styles.rect}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
          }}
        >
          {GRIPS.map(g => (
            <div
              key={g.id}
              className={styles.grip}
              data-grip={g.id}
              data-edge={g.at[0] === 50 || g.at[1] === 50}
              style={{ left: `${g.at[0]}%`, top: `${g.at[1]}%` }}
            />
          ))}
          <div className={styles.rotate} data-rotate title={t("Rotate")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" />
            </svg>
          </div>
        </div>
      )}
      <Bar item={item} />
    </>
  )
}

// 傾けた枠が収まる四角
function boundsOf(rect: Rect, rotation: number): { left: number; top: number; right: number; bottom: number } {
  const c = cornersOf(rect, rotation)
  const xs = c.map(p => p.x)
  const ys = c.map(p => p.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

// バーを枠の上に出せる高さ（画面の px）。足りなければ下に出す
const BAR_ROOM = 56

function Bar({ item }: { item: SelectedItem }) {
  const t = useMessages(kit)
  const set = useCommand(item.stage, SLIDE_SET.id)
  const reset = useCommand(item.stage, SLIDE_RESET.id)
  const b = boundsOf(item.rect, item.rotation)
  const above = b.top > BAR_ROOM
  const atRatio = item.ratio === undefined || Math.abs(item.rect.w / item.rect.h - item.ratio) < 0.005
  return (
    <div
      className={styles.bar}
      data-bar
      data-below={!above}
      role="toolbar"
      aria-label={t("Change on slide")}
      style={{ left: (b.left + b.right) / 2, top: above ? b.top : b.bottom }}
    >
      <button
        type="button"
        className={styles.button}
        aria-pressed={item.locked}
        title={t("Lock ratio")}
        disabled={!set.enabled}
        onClick={() => set.run({ item: item.id, props: { lockRatio: item.locked ? null : true } })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d={item.locked ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7.5-2"} />
        </svg>
        {t("Ratio")}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={!reset.enabled || atRatio}
        onClick={() => reset.run({ item: item.id })}
      >
        {t("Reset ratio")}
      </button>
      <AngleField key={`${item.id}:${item.rotation}`} item={item} />
    </div>
  )
}

// 角度の数字の入力。決める（Enter か外へ出る）と角度を変える。0 は角度を消す（水平）。入力が数字でなければ元に戻す
function AngleField({ item }: { item: SelectedItem }) {
  const t = useMessages(kit)
  const set = useCommand(item.stage, SLIDE_SET.id)
  const [text, setText] = useState(String(Math.round(item.rotation * 100) / 100))
  const commit = () => {
    const n = Number(text)
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(item.rotation))
      return
    }
    const angle = normalizeAngle(n)
    if (angle !== item.rotation) set.run({ item: item.id, props: { rotation: angle === 0 ? null : angle } })
  }
  return (
    <label className={styles.angle}>
      {t("Angle")}
      <input
        type="number"
        min={-360}
        max={360}
        step={1}
        value={text}
        disabled={!set.enabled}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
      />
      °
    </label>
  )
}
