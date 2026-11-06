// 鳥を描く所: 物の上の辺を歩く鳥（BirdWalk）と、鳥の絵の 1 コマ（frameStyle）。スタンドの中に置く。
// 物の上の辺が見える所の外に出たら（edgePinned のスタンドの useStandAway）、鳥の代わりに鳥の顔の丸い絵（マークならマークポインタ）を、
// 鳥の足元を見える所の縁に寄せた所に描き（歩く動きのまま縁を動く）、押すと付けた物を見せる。
// leaving になったら画面の外へ飛び去り、飛び去り終えたら onGone を呼ぶ。visit なら歩かずに立ち寄り（flight.ts の visitPose）、降りたら onArrived を呼び、
// 立ち寄り終えたら自分で飛び去る。
// 動きを減らす設定（prefers-reduced-motion）では、鳥は降りた所で正面を向いたまま動かず、飛び去るときはすぐ消える（立ち寄るなら、立ち寄る間だけ出す）
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import type { Point } from "../../../core/geom"
import { useStandAway } from "../utils/anchors"
import { STAND_MARGIN } from "../utils/stand-place"
import type { Bird } from "."
import styles from "./BirdWalk.module.css"
import {
  type Arrival,
  birdPose,
  FRONT,
  GAITS,
  type Gait,
  LEAVE,
  leavingPose,
  type Pose,
  VISIT_ARRIVE,
  visitLength,
  visitPose,
} from "./flight"
import { SHEETS, type Sheet } from "./frames"
import bunchoPointer from "./images/bird-marks/buncho.png"
import fukurouPointer from "./images/bird-marks/fukurou.png"
import inkoPointer from "./images/bird-marks/inko.png"
import suzumePointer from "./images/bird-marks/suzume.png"
import tsunagidoriPointer from "./images/bird-marks/tsunagidori.png"
import buncho from "./images/birds/buncho.png"
import fukurou from "./images/birds/fukurou.png"
import inko from "./images/birds/inko.png"
import suzume from "./images/birds/suzume.png"
import tsunagidori from "./images/birds/tsunagidori.png"

export const BIRD_SIZE = 48 // 歩く鳥の大きさ（画面の px）
export { FRONT }

const POINTER = 24 // 鳥の顔の丸い絵の大きさ

// 鳥ごとの顔の丸い絵（マークポインタと、送信トレイの行の絵）
export const BIRD_FACES: Record<Bird, string> = {
  tsunagidori: tsunagidoriPointer,
  inko: inkoPointer,
  buncho: bunchoPointer,
  suzume: suzumePointer,
  fukurou: fukurouPointer,
}

// 鳥ごとの絵・コマの切り出し・歩き方
const BIRDS: Record<Bird, { image: string; sheet: Sheet; gait: Gait }> = {
  tsunagidori: { image: tsunagidori, sheet: SHEETS.tsunagidori, gait: GAITS.tsunagidori },
  inko: { image: inko, sheet: SHEETS.inko, gait: GAITS.inko },
  buncho: { image: buncho, sheet: SHEETS.buncho, gait: GAITS.buncho },
  suzume: { image: suzume, sheet: SHEETS.suzume, gait: GAITS.suzume },
  fukurou: { image: fukurou, sheet: SHEETS.fukurou, gait: GAITS.fukurou },
}

// 鳥の絵の 1 コマを描く物の見た目（押せる物にするなら button に付ける）
export const birdClass = styles.bird

// 物の上の辺を歩く鳥。歩く所の幅は物の幅で、鳥は真ん中寄りの、鳥の幅の 2 倍ほどを往復する。arrival は最初に描くときの出方。
// children は鳥のコマを描く物（足元から置く見た目 style を受け取る）。paused の間は動きを止める。awayLabel は鳥の顔の丸い絵の名前
// 歩くなら出方 arrival を受け、立ち寄るなら（visit）出方は受けない（いつも飛んでくる）
type Motion =
  | { visit?: false; arrival: Arrival; onArrived?: never }
  | { visit: true; arrival?: never; onArrived?: () => void }

export function BirdWalk({
  bird,
  arrival = "fly",
  origin,
  paused = false,
  leaving = false,
  visit = false,
  onArrived,
  onGone,
  awayLabel,
  children,
}: Motion & {
  bird: Bird
  origin?: Element | null
  paused?: boolean
  leaving?: boolean
  onGone?: () => void
  awayLabel: string
  children: (style: CSSProperties) => ReactNode
}) {
  const away = useStandAway()
  const area = useRef<HTMLDivElement>(null)
  const [from, setFrom] = useState<Point>({ x: 0, y: 0 })
  const [time, setTime] = useState(0)
  const [width, setWidth] = useState(0)
  const stopped = useRef(paused)
  stopped.current = paused
  const still = useReducedMotion()
  const { sheet, gait } = BIRDS[bird]
  const scale = BIRD_SIZE / sheet.cell
  const range = Math.max(0, Math.min(2 * sheet.bodyWidth * scale, width - BIRD_SIZE - 12))
  // 歩く所の幅を測る。飛んでくるなら、飛んでくる所を画面（ステージ）の外に決める
  // biome-ignore lint/correctness/useExhaustiveDependencies: 飛んでくる所は、最初に描くときに一度だけ決める
  useEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (arrival === "fly") setFrom(origin ? fromElement(el, origin) : offscreen(el))
    return () => observer.disconnect()
  }, [arrival])
  useEffect(() => {
    if (still) return
    let frame = 0
    let last: number | null = null
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000)
      if (dt > 0 && !stopped.current) setTime(t => t + dt)
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [still])
  const walking: Pose = still
    ? { frame: FRONT, x: range, lift: 0, from: { x: 0, y: 0 }, right: false, rotation: 0, behind: false }
    : visit
      ? visitPose(time, gait, BIRD_SIZE, range, from)
      : birdPose(time, arrival, gait, BIRD_SIZE, range, from)
  const arrived = visit && (still || time >= VISIT_ARRIVE)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 降りたときに一度だけ
  useEffect(() => {
    if (arrived) onArrived?.()
  }, [arrived])
  // 動きを減らす設定で立ち寄るなら、立ち寄る間だけ出す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 出たときに一度だけ
  useEffect(() => {
    if (!visit || !still) return
    const timer = setTimeout(() => onGone?.(), visitLength(gait) * 1000)
    return () => clearTimeout(timer)
  }, [])
  const visited = visit && !still && time >= visitLength(gait)
  // 飛び去る: leaving になった時刻と姿と、飛んでいく先を覚える
  const [leave, setLeave] = useState<{ at: number; start: Pose; to: Point } | null>(null)
  const latest = useRef({ time, pose: walking })
  latest.current = { time, pose: walking }
  // biome-ignore lint/correctness/useExhaustiveDependencies: leaving になったとき（立ち寄り終えたとき）に一度だけ
  useEffect(() => {
    if (!(leaving || visited) || !area.current) return
    if (still) {
      onGone?.()
      return
    }
    setLeave({ at: latest.current.time, start: latest.current.pose, to: offscreen(area.current) })
  }, [leaving || visited])
  const gone = leave !== null && time - leave.at >= LEAVE
  // biome-ignore lint/correctness/useExhaustiveDependencies: 飛び去り終えたときに一度だけ
  useEffect(() => {
    if (gone) onGone?.()
  }, [gone])
  const pose = leave ? leavingPose(Math.min(LEAVE, time - leave.at), leave.start, leave.to) : walking
  const left = (width - range) / 2 + pose.x
  if (away && !leave) {
    const at = away.pin({ x: left, y: BIRD_SIZE }, POINTER / 2 + STAND_MARGIN)
    return (
      <div ref={area} className={styles.walk} data-bird-walk>
        <button
          type="button"
          className={styles.pointer}
          aria-label={awayLabel}
          title={awayLabel}
          onClick={away.show}
          style={{ left: at.x - POINTER / 2, top: at.y - POINTER / 2, backgroundImage: `url(${BIRD_FACES[bird]})` }}
          data-bird-pointer
        />
      </div>
    )
  }
  const body = (
    <div
      className={styles.foot}
      style={{
        left,
        transform: `translate(${pose.from.x.toString()}px, ${(pose.from.y + pose.lift).toString()}px) rotate(${pose.rotation.toString()}rad)`,
      }}
    >
      {children(frameStyle(bird, pose.frame, BIRD_SIZE, pose.right))}
    </div>
  )
  return (
    <div ref={area} className={styles.walk} data-bird-walk>
      {pose.behind ? <div className={styles.behind}>{body}</div> : body}
    </div>
  )
}

// 鳥の絵の 1 コマを、足元を原点に描く形（size は鳥の大きさ。flip なら足元で左右を返す）
export function frameStyle(bird: Bird, index: number, size: number, flip = false): CSSProperties {
  const { sheet, image } = BIRDS[bird]
  const [x, y, w, h, anchorX, groundY, clip] = sheet.frames[index] ?? sheet.frames[FRONT] ?? [0, 0, 0, 0, 0, 0, []]
  const s = size / sheet.cell
  const points: string[] = []
  for (let i = 0; i + 1 < clip.length; i += 2)
    points.push(`${((clip[i] ?? 0) * s).toString()}px ${((clip[i + 1] ?? 0) * s).toString()}px`)
  return {
    left: -anchorX * s,
    top: -(groundY + 1) * s,
    width: w * s,
    height: h * s,
    backgroundImage: `url(${image})`,
    backgroundSize: `${(sheet.size * s).toString()}px`,
    backgroundPosition: `${(-x * s).toString()}px ${(-y * s).toString()}px`,
    ...(points.length > 0 ? { clipPath: `polygon(${points.join(", ")})` } : {}),
    ...(flip ? { transform: "scaleX(-1)", transformOrigin: `${(anchorX * s).toString()}px 0` } : {}),
  }
}

// 歩く所の右端の足元から見た、要素 origin の上の辺の真ん中（別の物から飛んで移ってくるとき）
function fromElement(el: HTMLElement, origin: Element): Point {
  const at = el.getBoundingClientRect()
  const o = origin.getBoundingClientRect()
  return { x: o.left + o.width / 2 - at.right, y: o.top - at.bottom }
}

// 歩く所の右端の足元から見た、ステージ（スタンドのレイヤー）の外の、どこか 1 点（左・右・上のどれか）
function offscreen(el: HTMLElement): Point {
  const layer = el.closest("[data-stand-layer]") ?? document.body
  const box = layer.getBoundingClientRect()
  const at = el.getBoundingClientRect()
  const foot = { x: at.right, y: at.bottom }
  const pad = BIRD_SIZE * 2
  const side = Math.floor(Math.random() * 3)
  const along = Math.random()
  const target =
    side === 0
      ? { x: box.left - pad, y: box.top + along * box.height * 0.6 }
      : side === 1
        ? { x: box.right + pad, y: box.top + along * box.height * 0.6 }
        : { x: box.left + along * box.width, y: box.top - pad }
  return { x: target.x - foot.x, y: target.y - foot.y }
}

function useReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  return reduced
}
