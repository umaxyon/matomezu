// マークのレイヤー（ウィジェット mark-layer）: 開いているブックのマークを、付けた物の最後の 1 つのそばにスタンドで出す。
// 鳥のマークは物の上の辺を歩き（付けたときだけ、飛んでくるか物の裏から顔を出す。birds/）、びっくりマークは物の右上の角に止まる。
// どちらも押すと「外す？」の小さな吹き出しを出し、「はい」で外す。ポインタが離れるか、ほかを押すと隠す。
// マークの種類を選ぶスタンド（commands.ts の MARK_PICKER）が開いていれば、付ける先のそばに 6 つの種類の絵を並べ、押した種類を付ける。
// 動きを減らす設定（prefers-reduced-motion）では、鳥は降りた所で正面を向いたまま動かない。
// 付けた物の上の辺が見える所（画面と、物を囲む Revealable〈リストの行の並びなど〉の重なり）の外に出たら、鳥はマークポインタ（鳥の顔の丸い絵）に替わって
// 見える所の縁（囲む物が画面の外なら画面の縁）を歩き、びっくりマークは縁に寄って薄くなる。どちらも押すと、囲む物の中のスクロールと紙をずらして付けた物を見せる
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import type { Bird } from "../birds"
import { BirdWalk, birdClass, FRONT, frameStyle } from "../birds/BirdWalk"
import type { Arrival } from "../birds/flight"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import { kit } from "../kit"
import { Stand, useStandAway } from "../utils/anchors"
import { STAND_MARGIN } from "../utils/stand-place"
import type { StageSlotProps } from "../workspace/ui"
import { MARK, MARK_ADD, MARK_KINDS, MARK_REMOVE, type MarkKind, type MarkProps } from "."
import { MARK_PICKER } from "./commands"
import styles from "./MarkLayer.module.css"

const PICK_SIZE = 40 // 種類を選ぶスタンドの鳥の大きさ
const ALERT = 18 // びっくりマークの丸の大きさ

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
      <MarkBird id={id} bird={kind} title={title} onRemove={remove} />
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
  onBird = false,
  children,
}: {
  onRemove: () => void
  onAsking?: (asking: boolean) => void
  onBird?: boolean // 鳥の足元に置く（吹き出しを鳥の上に出す）
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
      className={onBird ? `${styles.ask} ${styles.onBird}` : styles.ask}
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

// 鳥のマーク: 物の上の辺を歩き、押すと「外す？」を出す（出している間は止まる）。この画面で付けたばかりなら、飛んでくるか顔を出す
function MarkBird({ id, bird, title, onRemove }: { id: string; bird: Bird; title: string; onRemove: () => void }) {
  const t = useMessages(kit)
  const [arrival] = useState<Arrival>(() => {
    if (!arriving.delete(id)) return "none"
    return Math.random() < 0.5 ? "fly" : "peek"
  })
  const [asking, setAsking] = useState(false)
  return (
    <BirdWalk bird={bird} arrival={arrival} paused={asking} awayLabel={t("Show {name}", { name: title })}>
      {style => (
        <RemoveAsk onRemove={onRemove} onAsking={setAsking} onBird>
          {toggle => <button type="button" className={birdClass} aria-label={title} onClick={toggle} style={style} />}
        </RemoveAsk>
      )}
    </BirdWalk>
  )
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
                <span className={`${birdClass} ${styles.pickFrame}`} style={frameStyle(k.id, FRONT, PICK_SIZE)} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Stand>
  )
}

// マークのアクションを、そのステージのブックに行う。断られたらトーストで知らせ、false を、行えたら結果を返す
