// マークのレイヤー（ウィジェット mark-layer）: 開いているブックのマークを、付けた物の最後の 1 つのそばにスタンドで出す。
// 鳥のマークは物の上の辺を歩き（付けたときだけ、飛んでくるか物の裏から顔を出す。flight.ts）、びっくりマークは物の右上の角に止まる。
// どちらも押すと「外す？」の小さな吹き出しを出し、「はい」で外す。ポインタが離れるか、ほかを押すと隠す。
// マークの種類を選ぶスタンド（commands.ts の MARK_PICKER）が開いていれば、付ける先のそばに 6 つの種類の絵を並べ、押した種類を付ける。
// 動きを減らす設定（prefers-reduced-motion）では、鳥は降りた所で正面を向いたまま動かない。
// 付けた物の上の辺が見える所（画面と、物を囲むリストの行の並びなど）の外に出たら、鳥はマークポインタ（鳥の顔の丸い絵）に替わって
// 見える所の縁（囲む物が画面の外なら画面の縁）を歩き、びっくりマークは縁に寄って薄くなる。どちらも押すと、囲む物の中のスクロールと紙をずらして付けた物を見せる
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react"
import type { Point } from "../../../core/geom"
import { useMessages } from "../../../ui/i18n"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import bunchoSign from "../images/bird-marks/buncho.png"
import fukurouSign from "../images/bird-marks/fukurou.png"
import inkoSign from "../images/bird-marks/inko.png"
import suzumeSign from "../images/bird-marks/suzume.png"
import tsunagidoriSign from "../images/bird-marks/tsunagidori.png"
import buncho from "../images/birds/buncho.png"
import fukurou from "../images/birds/fukurou.png"
import inko from "../images/birds/inko.png"
import suzume from "../images/birds/suzume.png"
import tsunagidori from "../images/birds/tsunagidori.png"
import { kit } from "../kit"
import { Stand, useStandAway } from "../utils/anchors"
import { STAND_MARGIN } from "../utils/stand-place"
import type { StageSlotProps } from "../workspace/ui"
import { type Bird, MARK, MARK_ADD, MARK_KINDS, MARK_REMOVE, type MarkKind, type MarkProps } from "."
import { MARK_PICKER } from "./commands"
import { type Arrival, birdPose, GAITS, type Gait } from "./flight"
import { SHEETS, type Sheet } from "./frames"
import styles from "./MarkLayer.module.css"

const SIZE = 48 // 鳥の大きさ（画面の px）
const PICK_SIZE = 40 // 種類を選ぶスタンドの鳥の大きさ
const FRONT = 4 // 正面を向いたコマ
const SIGN = 24 // マークポインタの大きさ
const ALERT = 18 // びっくりマークの丸の大きさ

// 鳥ごとのマークポインタの絵
const SIGNS: Record<Bird, string> = {
  tsunagidori: tsunagidoriSign,
  inko: inkoSign,
  buncho: bunchoSign,
  suzume: suzumeSign,
  fukurou: fukurouSign,
}

// 鳥ごとの絵・コマの切り出し・歩き方
const BIRDS: Record<Bird, { image: string; sheet: Sheet; gait: Gait }> = {
  tsunagidori: { image: tsunagidori, sheet: SHEETS.tsunagidori, gait: GAITS.tsunagidori },
  inko: { image: inko, sheet: SHEETS.inko, gait: GAITS.inko },
  buncho: { image: buncho, sheet: SHEETS.buncho, gait: GAITS.buncho },
  suzume: { image: suzume, sheet: SHEETS.suzume, gait: GAITS.suzume },
  fukurou: { image: fukurou, sheet: SHEETS.fukurou, gait: GAITS.fukurou },
}

// この画面で付けたばかりのマーク（最初に描くときだけ、飛んでくるか顔を出す）
const arriving = new Set<string>()

export function MarkLayer({ stage }: StageSlotProps) {
  const marks = useAnnotationsOf(stage, MARK.id)
  const picker = useAnchorTargets(stage, MARK_PICKER)
  return (
    <>
      {marks.map(m => (
        <MarkStand
          key={m.id}
          stage={stage}
          id={m.id}
          anchor={m.anchors.at(-1) ?? ""}
          kind={(m.props as MarkProps).kind}
        />
      ))}
      {picker && <PickerStand key={picker.anchors.join(" ")} stage={stage} picker={picker} />}
    </>
  )
}

function MarkStand({ stage, id, anchor, kind }: { stage: string; id: string; anchor: string; kind: MarkKind }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The mark was refused")
  const remove = () => run(MARK_REMOVE.id, { mark: id })
  const title = t(MARK_KINDS.find(k => k.id === kind)?.title ?? "Mark")
  if (kind === "alert")
    return (
      <Stand anchor={anchor} side="corner" edgePinned label={t("Mark")}>
        <PinnedAlert title={title} onRemove={remove} />
      </Stand>
    )
  return (
    <Stand anchor={anchor} side="edge" span edgePinned label={t("Mark")}>
      <BirdWalk id={id} bird={kind} title={title} onRemove={remove} />
    </Stand>
  )
}

// びっくりマーク: 押すと「外す？」を出す。付けた物の上の辺が見える所の外なら、丸を縁に寄せて薄く描き、押すと付けた物を見せる
function PinnedAlert({ title, onRemove }: { title: string; onRemove: () => void }) {
  const t = useMessages(kit)
  const away = useStandAway()
  const at = away?.pin({ x: ALERT / 2, y: ALERT / 2 }, ALERT / 2 + STAND_MARGIN)
  return (
    <div
      data-away={away !== null}
      style={
        at
          ? { transform: `translate(${(at.x - ALERT / 2).toString()}px, ${(at.y - ALERT / 2).toString()}px)` }
          : undefined
      }
    >
      {away ? (
        <button
          type="button"
          className={styles.alert}
          aria-label={t("Show {name}", { name: title })}
          title={t("Show {name}", { name: title })}
          onClick={away.show}
          data-mark-pointer
        >
          !
        </button>
      ) : (
        <RemoveAsk onRemove={onRemove}>
          {toggle => (
            <button type="button" className={styles.alert} aria-label={title} onClick={toggle}>
              !
            </button>
          )}
        </RemoveAsk>
      )}
    </div>
  )
}

const LEAVE_GRACE = 400 // ポインタが離れてから「外す？」を隠すまでの ms

// 押すと「外す？」の吹き出しを出す所。children は押す物（吹き出しを出し入れする関数を受け取る）。ポインタが離れて少し経つか、ほかを押すと隠す
function RemoveAsk({
  onRemove,
  onAsking,
  children,
}: {
  onRemove: () => void
  onAsking?: (asking: boolean) => void
  children: (toggle: () => void) => React.ReactNode
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 吹き出しを出し入れしたときだけ知らせる
  useEffect(() => {
    onAsking?.(asking)
  }, [asking])
  useEffect(() => {
    if (!asking) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAsking(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [asking])
  // ポインタが離れたら少し待って隠す（押す物と吹き出しの間の隙間を通って「はい」へ行けるように。戻れば隠さない）
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stay = () => clearTimeout(leaving.current)
  useEffect(() => () => clearTimeout(leaving.current), [])
  return (
    <div
      ref={ref}
      className={styles.ask}
      onPointerEnter={stay}
      onPointerLeave={() => {
        stay()
        leaving.current = setTimeout(() => setAsking(false), LEAVE_GRACE)
      }}
    >
      {asking && (
        // biome-ignore lint/a11y/useSemanticElements: 吹き出しは問いとボタンを束ねる箱で、入力Formのまとまり（fieldset）ではない
        <div className={styles.askBubble} role="group" aria-label={t("Remove?")}>
          <span>{t("Remove?")}</span>
          <button type="button" className={styles.yes} onClick={onRemove}>
            {t("Yes")}
          </button>
        </div>
      )}
      {children(() => setAsking(a => !a))}
    </div>
  )
}

// 物の上の辺を歩く鳥。歩く所の幅は物の幅で、鳥は真ん中寄りの、鳥の幅の 2 倍ほどを往復する
// 付けた物の上の辺が見える所の外なら、鳥の代わりにマークポインタを、鳥の足元を見える所の縁に寄せた所に描く（歩く動きのまま縁を動く）
function BirdWalk({ id, bird, title, onRemove }: { id: string; bird: Bird; title: string; onRemove: () => void }) {
  const t = useMessages(kit)
  const away = useStandAway()
  const area = useRef<HTMLDivElement>(null)
  const [arrival] = useState<Arrival>(() => {
    if (!arriving.delete(id)) return "none"
    return Math.random() < 0.5 ? "fly" : "peek"
  })
  const [from, setFrom] = useState<Point>({ x: 0, y: 0 })
  const [time, setTime] = useState(0)
  const [width, setWidth] = useState(0)
  const paused = useRef(false)
  const still = useReducedMotion()
  const { sheet, gait } = BIRDS[bird]
  const scale = SIZE / sheet.cell
  const range = Math.max(0, Math.min(2 * sheet.bodyWidth * scale, width - SIZE - 12))
  // 歩く所の幅を測る。飛んでくるなら、飛んでくる所を画面（ステージ）の外に決める
  useEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (arrival === "fly") setFrom(offscreen(el))
    return () => observer.disconnect()
  }, [arrival])
  useEffect(() => {
    if (still) return
    let frame = 0
    let last: number | null = null
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000)
      if (dt > 0 && !paused.current) setTime(t => t + dt)
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [still])
  const pose = still
    ? { frame: FRONT, x: range, lift: 0, from: { x: 0, y: 0 }, right: false, rotation: 0, behind: false }
    : birdPose(time, arrival, gait, SIZE, range, from)
  const left = (width - range) / 2 + pose.x
  if (away) {
    const at = away.pin({ x: left, y: SIZE }, SIGN / 2 + STAND_MARGIN)
    return (
      <div ref={area} className={styles.walk} data-mark-walk>
        <button
          type="button"
          className={styles.pointer}
          aria-label={t("Show {name}", { name: title })}
          title={t("Show {name}", { name: title })}
          onClick={away.show}
          style={{ left: at.x - SIGN / 2, top: at.y - SIGN / 2, backgroundImage: `url(${SIGNS[bird]})` }}
          data-mark-pointer
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
      <RemoveAsk
        onRemove={onRemove}
        onAsking={a => {
          paused.current = a
        }}
      >
        {toggle => (
          <button
            type="button"
            className={styles.bird}
            aria-label={title}
            onClick={toggle}
            style={frameStyle(bird, pose.frame, SIZE, pose.right)}
          />
        )}
      </RemoveAsk>
    </div>
  )
  return (
    <div ref={area} className={styles.walk} data-mark-walk>
      {pose.behind ? <div className={styles.behind}>{body}</div> : body}
    </div>
  )
}

// 鳥の絵の 1 コマを、足元を原点に描く形（size は鳥の大きさ。flip なら足元で左右を返す）
function frameStyle(bird: Bird, index: number, size: number, flip = false): CSSProperties {
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

// 歩く所の右端の足元から見た、ステージ（スタンドのレイヤー）の外の、どこか 1 点（左・右・上のどれか）
function offscreen(el: HTMLElement): Point {
  const layer = el.closest("[data-stand-layer]") ?? document.body
  const box = layer.getBoundingClientRect()
  const at = el.getBoundingClientRect()
  const foot = { x: at.right, y: at.bottom }
  const pad = SIZE * 2
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

// マークの種類を選ぶスタンド: 6 つの種類の絵を並べ、押した種類を付ける。Esc か、ほかを押すと付けずに閉じる
function PickerStand({ stage, picker }: { stage: string; picker: AnchorTargets }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The mark was refused")
  const setPicker = useSetAnchorTargets(MARK_PICKER)
  const ref = useRef<HTMLDivElement>(null)
  const end = () => setPicker(stage, null)
  const pick = (kind: MarkKind) => {
    const done = run(MARK_ADD.id, { anchors: [...picker.anchors], kind })
    if (done) {
      const mark = (done as { mark?: string }).mark
      if (mark) arriving.add(mark)
      end()
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いたときに一度だけ
  useEffect(() => {
    let frame = 0
    // スタンドは測り終えるまで描かれないか隠れているので、見えて焦点が入るまで試す
    const tryFocus = () => {
      const el = ref.current?.querySelector("button")
      el?.focus()
      if (!el || document.activeElement !== el) frame = requestAnimationFrame(tryFocus)
    }
    tryFocus()
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) end()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") end()
  }
  return (
    <Stand anchor={picker.anchors.at(-1) ?? ""} side="right" label={t("Add mark")}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Esc で閉じるだけ（選ぶのは中のボタン） */}
      <div ref={ref} className={styles.picker} onKeyDown={onKeyDown}>
        {MARK_KINDS.map(k => (
          <button
            key={k.id}
            type="button"
            className={styles.pick}
            aria-label={t(k.title)}
            title={t(k.title)}
            onClick={() => pick(k.id)}
          >
            {k.id === "alert" ? (
              <span className={styles.alert}>!</span>
            ) : (
              <span className={styles.pickBird}>
                <span className={styles.bird} style={frameStyle(k.id, FRONT, PICK_SIZE)} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Stand>
  )
}

// マークのアクションを、そのステージのブックに行う。断られたらトーストで知らせ、false を、行えたら結果を返す
