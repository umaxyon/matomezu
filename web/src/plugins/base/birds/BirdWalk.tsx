// 鳥を描く所: 物の上の辺を歩く鳥（BirdWalk）と、鳥の絵の 1 コマ（frameStyle）。スタンドの中に置く。
// 物の上の辺が見える所の外に出たら（edgePinned のスタンドの useStandAway）、鳥の代わりに鳥の顔の丸い絵（マークならマークポインタ）を、
// 鳥の足元を見える所の縁に寄せた所に描き（歩く動きのまま縁を動く）、押すと付けた物を見せる。
// leaving になったら画面の外へ飛び去り、飛び去り終えたら onGone を呼ぶ。visit なら歩かずに立ち寄り（flight.ts の visitPose）、降りたら onArrived を呼び、
// 立ち寄り終えたら自分で飛び去る。
// 動きを減らす設定（prefers-reduced-motion）では、鳥は降りた所で正面を向いたまま動かず、飛び去るときはすぐ消える（立ち寄るなら、立ち寄る間だけ出す）
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import type { Point } from "../../../core/geom"
import { useStandAway, useStandShape } from "../utils/anchors"
import { STAND_MARGIN } from "../utils/stand-place"
import type { Bird } from "."
import styles from "./BirdWalk.module.css"
import {
  type Arrival,
  birdPose,
  FRONT,
  GAITS,
  LEAVE,
  leavingPose,
  orbitingPose,
  type Pose,
  VISIT_ARRIVE,
  visitLength,
  visitPose,
} from "./flight"
import { type Footing, footing, lengthOf, lineMotion } from "./line"
import { ANCHOR_X, BODY_WIDTH, CELL, COLUMNS, FRAME, GROUND_Y, SHEET_SIZE } from "./sheets"
import { useBirdFace, useBirdSheet } from "./use-bird-sheet"

export const BIRD_SIZE = 48 // 歩く鳥の大きさ（画面の px）
export { FRONT }

const POINTER = 24 // 鳥の顔の丸い絵の大きさ

// 鳥の絵の 1 コマを描く物の見た目（押せる物にするなら button に付ける）
export const birdClass = styles.bird

// 物の上の辺を歩く鳥。palette は鳥の配色（colors.ts の BIRD_PALETTES の id。無ければ元の配色）。色を塗り終わるまでは、歩く所だけを出す。歩く所の幅は物の幅で、鳥は真ん中寄りの、鳥の幅の 2 倍ほどを往復する。arrival は最初に描くときの出方。
// children は鳥のコマを描く物（足元から置く見た目 style を受け取る）。paused の間は動きを止める。awayLabel は鳥の顔の丸い絵の名前
// 歩くなら出方 arrival を受け、立ち寄るなら（visit）出方は受けない（いつも飛んでくる）
type Motion =
  | { visit?: false; arrival: Arrival; onArrived?: never }
  | { visit: true; arrival?: never; onArrived?: () => void }

export function BirdWalk(props: WalkProps) {
  const sheet = useBirdSheet(props.bird, props.palette)
  if (sheet === null) return <div className={styles.walk} data-bird-walk />
  return <Walker {...props} sheet={sheet} />
}

type WalkProps = Motion & {
  bird: Bird
  palette?: string
  origin?: Element | null
  paused?: boolean
  leaving?: boolean
  onGone?: () => void
  awayLabel: string
  children: (style: CSSProperties) => ReactNode
}

function Walker({
  bird,
  palette,
  sheet: sheetUrl,
  arrival = "fly",
  origin,
  paused = false,
  leaving = false,
  visit = false,
  onArrived,
  onGone,
  awayLabel,
  children,
}: WalkProps & { sheet: string }) {
  const away = useStandAway()
  const face = useBirdFace(bird, palette)
  const area = useRef<HTMLDivElement>(null)
  const [from, setFrom] = useState<Point>({ x: 0, y: 0 })
  const [time, setTime] = useState(0)
  const [width, setWidth] = useState(0)
  const stopped = useRef(paused)
  stopped.current = paused
  const still = useReducedMotion()
  const gait = GAITS[bird]
  const scale = BIRD_SIZE / CELL
  // 付けた物が線なら（立ち寄りは除く）、線の形に沿う: 歩ける横向きの区間があればその上を歩き、無ければ線の周りを飛ぶ（line.ts）
  const path = useStandShape()
  const motion = !visit && path ? lineMotion(path, 2 * BIRD_SIZE) : null
  const arrivalOn = motion && arrival === "peek" ? "fly" : arrival
  const room = motion?.kind === "walk" ? lengthOf([motion.from, motion.to]) : width
  const range = Math.max(0, Math.min(2 * BODY_WIDTH[bird] * scale, room - BIRD_SIZE - 12))
  // 歩く所の幅を測る。飛んでくるなら、飛んでくる所を画面（ステージ）の外に決める
  // biome-ignore lint/correctness/useExhaustiveDependencies: 飛んでくる所は、最初に描くときに一度だけ決める
  useEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (arrivalOn === "fly" || motion?.kind === "orbit") {
      const foot = path && motion ? footing(path, motion, { x: range, rotation: 0 }, range, false) : null
      const land = foot
        ? { x: el.getBoundingClientRect().left + foot.x, y: el.getBoundingClientRect().top + foot.y }
        : null
      setFrom(origin ? fromElement(el, origin, land) : offscreen(el, land))
    }
    return () => observer.disconnect()
  }, [arrivalOn])
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
      : motion?.kind === "orbit"
        ? orbitingPose(time, arrivalOn, from)
        : birdPose(time, arrivalOn, gait, BIRD_SIZE, range, from)
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
  const footRef = useRef<Footing | null>(null)
  const latest = useRef({ time, pose: walking })
  latest.current = { time, pose: walking }
  // biome-ignore lint/correctness/useExhaustiveDependencies: leaving になったとき（立ち寄り終えたとき）に一度だけ
  useEffect(() => {
    if (!(leaving || visited) || !area.current) return
    if (still) {
      onGone?.()
      return
    }
    const foot = footRef.current
    const box = area.current.getBoundingClientRect()
    const land = foot ? { x: box.left + foot.x, y: box.top + foot.y } : null
    setLeave({ at: latest.current.time, start: latest.current.pose, to: offscreen(area.current, land) })
  }, [leaving || visited])
  const gone = leave !== null && time - leave.at >= LEAVE
  // biome-ignore lint/correctness/useExhaustiveDependencies: 飛び去り終えたときに一度だけ
  useEffect(() => {
    if (gone) onGone?.()
  }, [gone])
  const pose = leave ? leavingPose(Math.min(LEAVE, time - leave.at), leave.start, leave.to) : walking
  const lined: Footing | null = path && motion ? footing(path, motion, leave ? leave.start : pose, range, still) : null
  footRef.current = lined
  const left = lined ? lined.x : (width - range) / 2 + pose.x
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
          style={{
            left: at.x - POINTER / 2,
            top: at.y - POINTER / 2,
            ...(face ? { backgroundImage: `url(${face})` } : {}),
          }}
          data-bird-pointer
        />
      </div>
    )
  }
  const size = pose.scale === undefined ? "" : ` scale(${pose.scale.toString()})`
  const body = (
    <div
      className={styles.foot}
      style={{
        left,
        ...(lined ? { top: lined.y } : {}),
        ...(pose.opacity === undefined ? {} : { opacity: pose.opacity }),
        transform: `translate(${pose.from.x.toString()}px, ${(pose.from.y + pose.lift).toString()}px) rotate(${(pose.rotation + (lined?.tilt ?? 0)).toString()}rad)${size}`,
      }}
    >
      {children(frameStyle(sheetUrl, pose.frame, BIRD_SIZE, pose.right))}
    </div>
  )
  return (
    <div ref={area} className={styles.walk} data-bird-walk>
      {pose.behind ? <div className={styles.behind}>{body}</div> : body}
    </div>
  )
}

// 鳥の絵の 1 コマ（シート sheet の index 番目。足元より下の空きは含めない）を、足元を原点に描く形（size は鳥の大きさ。flip なら足元で左右を返す）
export function frameStyle(sheet: string, index: number, size: number, flip = false): CSSProperties {
  const s = size / CELL
  const at = index >= 0 && index < COLUMNS * COLUMNS ? index : FRONT
  return {
    left: -ANCHOR_X * s,
    top: -(GROUND_Y + 1) * s,
    width: FRAME * s,
    height: (GROUND_Y + 1) * s,
    backgroundImage: `url(${sheet})`,
    backgroundSize: `${(SHEET_SIZE * s).toString()}px`,
    backgroundPosition: `${(-(at % COLUMNS) * FRAME * s).toString()}px ${(-Math.floor(at / COLUMNS) * FRAME * s).toString()}px`,
    ...(flip ? { transform: "scaleX(-1)", transformOrigin: `${(ANCHOR_X * s).toString()}px 0` } : {}),
  }
}

// 歩く所の右端の足元から見た、要素 origin の上の辺の真ん中（別の物から飛んで移ってくるとき）
// （降りる足元 foot が画面での位置で分かっていれば、右端の代わりにそれを使う）
function fromElement(el: HTMLElement, origin: Element, foot: Point | null): Point {
  const at = el.getBoundingClientRect()
  const o = origin.getBoundingClientRect()
  const land = foot ?? { x: at.right, y: at.bottom }
  return { x: o.left + o.width / 2 - land.x, y: o.top - land.y }
}

// 歩く所の右端の足元から見た、ステージ（スタンドのレイヤー）の外の、どこか 1 点（左・右・上のどれか）
function offscreen(el: HTMLElement, land: Point | null): Point {
  const layer = el.closest("[data-stand-layer]") ?? document.body
  const box = layer.getBoundingClientRect()
  const at = el.getBoundingClientRect()
  const foot = land ?? { x: at.right, y: at.bottom }
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
