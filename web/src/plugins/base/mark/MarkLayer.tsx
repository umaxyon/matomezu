// マークのレイヤー（ウィジェット mark-layer）: 開いているブックのマークを、付けた物の最後の 1 つのそばにスタンドで出す。
// 鳥のマークは物の上の辺を歩き（付けたときだけ、飛んでくるか物の裏から顔を出す。birds/）、びっくりマークは物の右上の角に止まる
// （角に出すほかの物〈伝言など〉と一緒に角のスタンドにまとまり、並びの先頭に来る。corner-status/corner.tsx）。
// どちらも押すと「外す？」の小さな吹き出しを出し、「はい」で外す。ポインタが離れるか、ほかを押すと隠す。
// マークの種類を選ぶスタンド（states.ts の MARK_PICKER）が開いていれば、付ける先のそばに 6 つの種類の絵を並べ、押した種類を付ける。
// 動きを減らす設定（prefers-reduced-motion）では、鳥は降りた所で正面を向いたまま動かない。
// 付けた物の上の辺が見える所（画面と、物を囲む Revealable〈リストの行の並びなど〉の重なり）の外に出たら、鳥はマークポインタ（鳥の顔の丸い絵）に替わって
// 見える所の縁（囲む物が画面の外なら画面の縁）を歩き、びっくりマークは縁に寄って薄くなる。どちらも押すと、囲む物の中のスクロールと紙をずらして付けた物を見せる
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useReadPluginState, useResetPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import type { Bird } from "../birds"
import { BirdWalk, birdClass, FRONT, frameStyle } from "../birds/BirdWalk"
import type { Arrival } from "../birds/flight"
import { useBirdSheet } from "../birds/use-bird-sheet"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import { AtCorner, useAtCornerBubble } from "../corner-status/corner"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { Ask, useRemoveAsk } from "../stand/Ask"
import { Stand, StandAt } from "../stand/anchors"
import { StandPointer } from "../stand/StandPointer"
import { lastAnchor } from "../utils/anchors"
import { useAnnotationsOf, usePerformOrToast } from "../utils/annotation-hooks"
import { MARK, MARK_ADD, MARK_KINDS, MARK_REMOVE, type MarkKind, type MarkProps } from "."
import styles from "./MarkLayer.module.css"
import { MARK_ARRIVING, MARK_PICKER } from "./states"

const PICK_SIZE = 40 // 種類を選ぶスタンドの鳥の大きさ
const ALERT = 18 // びっくりマークの丸の大きさ

export function MarkLayer() {
  const marks = useAnnotationsOf(MARK.id)
  const picker = useAnchorTargets(MARK_PICKER)
  return (
    <>
      {marks.map(m => (
        <MarkStand
          key={m.id}
          id={m.id}
          anchor={lastAnchor(m.anchors)}
          kind={(m.props as MarkProps).kind}
          addedAt={(m.props as MarkProps).addedAt}
        />
      ))}
      {picker && <PickerStand key={picker.anchors.join(" ")} picker={picker} />}
    </>
  )
}

function MarkStand({ id, anchor, kind, addedAt }: { id: string; anchor: string; kind: MarkKind; addedAt: string }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(kit.message("The mark was refused"))
  const remove = () => run(MARK_REMOVE.id, { mark: id })
  const title = t(MARK_KINDS.find(k => k.id === kind)?.title ?? "Mark")
  const awayLabel = t("Show {name}", { name: useAnchorName(anchor) })
  if (kind === "alert")
    return (
      <AtCorner
        anchor={anchor}
        status={ALERT_STATUS_ID}
        at={addedAt}
        pointer={
          <StandPointer center={{ x: ALERT / 2, y: ALERT / 2 }} size={ALERT} label={awayLabel} className={styles.alert}>
            !
          </StandPointer>
        }
      >
        <PinnedAlert title={title} onRemove={remove} />
      </AtCorner>
    )
  return (
    <StandAt anchor={anchor} side="edge" span edgePinned label={t("Mark")} through>
      <MarkBird id={id} bird={kind} title={title} awayLabel={awayLabel} onRemove={remove} />
    </StandAt>
  )
}

// コーナーステータスのびっくりマーク（スロット corner-statuses に置くウィジェット）の id と、まとめた絵に重ねる絵
export const ALERT_STATUS_ID = kit.name("alert-status")
export function AlertLook() {
  return <span className={styles.alert}>!</span>
}

// びっくりマーク: 押すと「外す？」を出す（角の吹き出しの中なら、吹き出しの広がった向きに重ねて出す）
function PinnedAlert({ title, onRemove }: { title: string; onRemove: () => void }) {
  const below = useAtCornerBubble() === "below"
  const ask = useRemoveAsk(onRemove)
  return (
    <div data-away="false">
      <Ask items={ask} place={below ? "below" : "above"}>
        {toggle => (
          <button type="button" className={styles.alert} aria-label={title} onClick={toggle}>
            !
          </button>
        )}
      </Ask>
    </div>
  )
}

// 鳥のマーク: 物の上の辺を歩き、押すと「外す？」を出す（出している間は止まる）。この画面で付けたばかりなら、飛んでくるか顔を出す
function MarkBird({
  id,
  bird,
  title,
  awayLabel,
  onRemove,
}: {
  id: string
  bird: Bird
  title: string
  awayLabel: string
  onRemove: () => void
}) {
  const readArriving = useReadPluginState(kit, MARK_ARRIVING)
  const setArriving = useSetPluginState(kit, MARK_ARRIVING)
  const resetArriving = useResetPluginState(kit, MARK_ARRIVING)
  // この窓で付けたばかりなら、最初に描くときだけ飛んでくるか顔を出し、付けたばかりの印を外す
  const [arrival] = useState<Arrival>(() =>
    readArriving().includes(id) ? (Math.random() < 0.5 ? "fly" : "peek") : "none",
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 最初に描いたときに一度だけ
  useEffect(() => {
    if (arrival === "none") return
    const rest = readArriving().filter(m => m !== id)
    if (rest.length > 0) setArriving(rest)
    else resetArriving()
  }, [])
  const [asking, setAsking] = useState(false)
  const ask = useRemoveAsk(onRemove)
  return (
    <BirdWalk bird={bird} arrival={arrival} paused={asking} awayLabel={awayLabel}>
      {style => (
        <Ask items={ask} onAsking={setAsking} place="bird">
          {toggle => <button type="button" className={birdClass} aria-label={title} onClick={toggle} style={style} />}
        </Ask>
      )}
    </BirdWalk>
  )
}

// マークの種類を選ぶスタンド: 6 つの種類の絵を並べ、押した種類を付ける。Esc か、ほかを押すと付けずに閉じる
function PickerStand({ picker }: { picker: AnchorTargets }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(kit.message("The mark was refused"))
  const setPicker = useSetAnchorTargets(MARK_PICKER)
  const readArriving = useReadPluginState(kit, MARK_ARRIVING)
  const setArriving = useSetPluginState(kit, MARK_ARRIVING)
  const ref = useRef<HTMLDivElement>(null)
  const end = () => setPicker(null)
  const pick = (kind: MarkKind) => {
    const done = run(MARK_ADD.id, { anchors: [...picker.anchors], kind })
    if (done) {
      const mark = (done as { mark?: string }).mark
      if (mark) setArriving([...readArriving(), mark])
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
    <Stand anchor={lastAnchor(picker.anchors)} side="right" label={t("Add mark")}>
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
                <PickFrame bird={k.id} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Stand>
  )
}

// 種類を選ぶスタンドの鳥の絵（色を塗り終わるまでは出さない）
function PickFrame({ bird }: { bird: Bird }) {
  const sheet = useBirdSheet(bird)
  if (sheet === null) return null
  return <span className={`${birdClass} ${styles.pickFrame}`} style={frameStyle(sheet, FRONT, PICK_SIZE)} />
}
