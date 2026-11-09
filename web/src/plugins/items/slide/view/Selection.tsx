// 選んだスライドのアイテムの上に出す物: 枠線・四隅と四辺のつまみ・回すつまみ（右上の角の斜め外）と、そばに立つバー（スタンド。上が足りなければ下。比率の固定・比率を元に戻す・角度）。
// 枠とつまみは、アイテムと同じ位置・大きさ・角度でかける。大きさは画面の上で一定にする（紙の倍率 --paper-zoom で割る）。バーは傾けず、倍率でも変えない（スタンドが付いて動く）
import { useState } from "react"
import type { Rect } from "../../../../plugin-api"
import { useCommand, useMessages } from "../../../../plugin-api/ui"
import { Stand } from "../../../base/ui"
import { SLIDE_RESET, SLIDE_SET } from "../commands"
import { kit } from "../kit"
import { normalizeAngle, pointsOnPaper } from "../rect"
import { FREE_LINE, STRAIGHT_LINE } from "../slide"
import styles from "./Selection.module.css"
import { type StyleSubject, StyleTools } from "./StyleTools"

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
  kind: string // アイテムの種類の id
  props: Readonly<Record<string, unknown>>
}

export function Selection({ item, hidden }: { item: SelectedItem; hidden: boolean }) {
  const { rect, rotation } = item
  const t = useMessages(kit)
  return (
    <>
      {!hidden && (
        <div
          className={styles.frame}
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
      {!hidden && <PointHandles item={item} />}
      <Bar item={item} />
    </>
  )
}

function Bar({ item }: { item: SelectedItem }) {
  const t = useMessages(kit)
  const set = useCommand(item.stage, SLIDE_SET.id)
  const reset = useCommand(item.stage, SLIDE_RESET.id)
  const atRatio = item.ratio === undefined || Math.abs(item.rect.w / item.rect.h - item.ratio) < 0.005
  return (
    <Stand anchor={item.id} side="above" label={t("Change on slide")}>
      <div className={styles.bar} data-bar role="toolbar" aria-label={t("Change on slide")}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={item.locked}
          title={t("Lock ratio")}
          disabled={!set.enabled}
          onClick={() => set.run({ items: [item.id], props: { lockRatio: item.locked ? null : true } })}
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
        <StyleTools
          key={`${item.id}:${item.kind}`}
          subjects={[{ id: item.id, stage: item.stage, item: item.kind, props: item.props }]}
        />
      </div>
    </Stand>
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
    if (angle !== item.rotation) set.run({ items: [item.id], props: { rotation: angle === 0 ? null : angle } })
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

// 複数を選んでいるときに出す物: 選んだ物の全体を囲む点線の枠（縁を押してドラッグすれば、選んだ物を一緒に動かす）と、
// そばに立つバー（全部に一度に効く見た目の道具だけ。大きさ・回す・角度は出さない）
export function GroupSelection({ rect, subjects }: { rect: Rect; subjects: readonly StyleSubject[] }) {
  const t = useMessages(kit)
  const first = subjects[0]
  return (
    <>
      <div className={styles.group} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        {(["top", "right", "bottom", "left"] as const).map(side => (
          <div key={side} className={styles.groupEdge} data-group-edge={side} />
        ))}
      </div>
      {first && (
        <Stand anchor={subjects.map(s => s.id)} side="above" label={t("Change on slide")}>
          <div className={styles.bar} data-bar role="toolbar" aria-label={t("Change on slide")}>
            <StyleTools subjects={subjects} />
          </div>
        </Stand>
      )}
    </>
  )
}

// 線の点（0 から 1 の割合）: 直線は両端、自由な線はすべての点
export function linePoints(
  kind: string,
  props: Readonly<Record<string, unknown>>,
): readonly { x: number; y: number }[] {
  if (kind === FREE_LINE.id) return (props.points as { x: number; y: number }[] | undefined) ?? []
  if (kind === STRAIGHT_LINE.id)
    return [
      (props.from as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
      (props.to as { x: number; y: number } | undefined) ?? { x: 1, y: 1 },
    ]
  return []
}

// 点が多い自由な線は、このくらいの数に間引いてつまみを出す（始めと終わりは必ず出す）
const MAX_HANDLES = 40

// 選んだ線の点のつまみ（丸。枠の 8 つのつまみとは別）。ドラッグで点を動かす（動かす操作は SlideLayer が受ける）
function PointHandles({ item }: { item: SelectedItem }) {
  const points = linePoints(item.kind, item.props)
  if (points.length === 0) return null
  const on = pointsOnPaper(item.rect, item.rotation, points)
  const every = Math.ceil(on.length / MAX_HANDLES)
  return (
    <>
      {on.map((p, index) =>
        index % every === 0 || index === on.length - 1 ? (
          <div key={index} className={styles.point} data-point={index} style={{ left: p.x, top: p.y }} />
        ) : null,
      )}
    </>
  )
}
