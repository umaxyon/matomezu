// 伝言のレイヤー（ウィジェット note-layer）: 開いているブックの伝言を、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出す伝言は物の右に、文の始め（BUBBLE_CHARS 字）だけの吹き出しを、物の方へ曲がる尾を付けて出し、たたんだ伝言は物の右上の角に伝言の絵を出す。
// 吹き出しは右に入らなくても左に回さず、物に重ねもしない。いつもの位置（尾の先が物の右の端）のまま、置ける範囲の右の端に押されて幅を縮める。
// BUBBLE_MIN_W まで縮めても入らなければ、物が見える所の外に出たのと同じに、縁のマークポインタにする。
// AI が読んだ伝言は、吹き出しも絵も出さず、物の右上の角に緑の丸のチェックを出す（吹き出しを出すかのデータは変えない）。
// 角の絵とチェックは、角に出すほかの物（マークなど）と一緒に角のスタンドにまとまる（utils/corner.tsx。2 つ以上なら、乗せると広がる吹き出しから 1 つずつ選ぶ）。
// 角の中の並びは、マークの後に、たたんだ伝言、既読の伝言の順で、それぞれ付けた時点の新しい順。
// 付けた物の上の辺が見える所の外に出たら、吹き出しか絵かチェックの代わりにマークポインタを縁に出し、押すと付けた物を見せる（読まれていない伝言は丸の中に伝言の絵、読まれた伝言は緑の丸のチェック）。
// 吹き出しか絵かチェックを押すと、右サイドパネルにその伝言を出す（付けた先を選び、吹き出しの物をカレントにする。吹き出しを出すかのデータは変えない）。
// 選択に従う右サイドパネルの中身（書いている伝言など）を出している間は、吹き出しの物を押したのと同じにする（選ぶ。Mod なら足す・外す。書きかけを生かす）。
// 右サイドパネルがほかの物を出している間は、角の吹き出しの中の絵とチェックは薄くして押せなくし、それ以外（物の右の吹き出し・角に 1 つだけの絵とチェック）は押すと閉じるだけ。
// 吹き出しにマウスかペンを乗せると、上に「隠す [はい]」を出し、はいでたたむ。角のたたんだ伝言の絵に乗せると「表示 [はい]　消す [はい]」を出し、
// 表示で吹き出しに戻し、消すで伝言を消す（タッチでは出さず、右サイドパネルのボタンを使う。既読のチェックには出さない。変えられないときと、角の絵を押せない間は出さない）。
// 吹き出しの色はスキンの bubble だけで、物や伝言の様子では変えない。右サイドパネルが伝言を出している間は、付ける先に鳥を出す（NoteBirds）
import type { MouseEvent, ReactNode } from "react"
import { stageIn } from "../../../core/window"
import { useMessages } from "../../../ui/i18n"
import { useReadState } from "../../../ui/store-context"
import { useActionsHere, useAllowed } from "../../../ui/view-hooks"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import {
  useCloseRightSidePanel,
  useFollowsSelection,
  useOpenRightSidePanel,
  useRightSidePanel,
} from "../right-side-panel/hooks"
import { pointedSelection } from "../right-side-panel/state"
import { clampChars } from "../text/text"
import { Ask, type AskItem } from "../utils/Ask"
import { StandAt, useStandAway, useStandFacing } from "../utils/anchors"
import { AtCorner, useAtCornerBubble } from "../utils/corner"
import { StandPointer } from "../utils/StandPointer"
import { facingY } from "../utils/stand-place"
import { modPressed } from "../utils/ui"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_REMOVE, NOTE_UPDATE, type NoteProps } from "."
import { NoteBirds } from "./NoteBirds"
import styles from "./NoteLayer.module.css"
import { FOLDED_NOTE_STATUS_ID, NEW_NOTE, NOTE_PANEL_ID, READ_NOTE_STATUS_ID } from "./panel-id"

export const BUBBLE_CHARS = 20 // 吹き出しに出す、文の始めの字数（送信トレイの行も同じ）
const POINTER = 24 // マークポインタの丸の大きさ（マークと同じ）
const BUBBLE_W = 180 // 吹き出しの幅と、範囲の右の端で止めたときに縮める下限
const BUBBLE_MIN_W = 72
const TAIL_W = 14 // 吹き出しの尾の幅と高さ（尾の先は左下。吹き出しの左の、物とのすき間に出す）
const TAIL_H = 16

export function NoteLayer({ stage }: StageSlotProps) {
  const notes = useAnnotationsOf(stage, NOTE.id)
  return (
    <>
      {notes.map(n => {
        const props = n.props as NoteProps
        const Shown = props.readAt !== undefined ? ReadNote : props.bubble ? BubbleStand : FoldedNote
        return <Shown key={n.id} stage={stage} id={n.id} anchors={n.anchors} props={props} />
      })}
      <NoteBirds stage={stage} />
    </>
  )
}

// 伝言の吹き出し・絵・チェックを押したとき: 選択に従う中身を出している間は、物を押したのと同じに選ぶ（Mod なら足す・外す）。
// 右サイドパネルがほかの物を出している間は閉じるだけ。そうでなければ、伝言 note（付けた先 anchors、吹き出しの物は最後）で開く。
// busy は、右サイドパネルが、新しく書いている伝言でもこの伝言でもない物を出しているか（角の絵とチェックは、その間は薄くして押せない）
function useOpenNote(stage: string, note: string, anchors: readonly string[]) {
  const openPanel = useOpenRightSidePanel()
  const closePanel = useCloseRightSidePanel()
  const shown = useRightSidePanel(stage)
  const follows = useFollowsSelection(stage)
  const read = useReadState()
  const { select } = useActionsHere()
  const anchor = anchors.at(-1) ?? ""
  const busy = !!shown && shown.subject !== note && shown.subject !== NEW_NOTE
  // 物を押したときと同じく、焦点はスタンドに残さない（スタンドはキーを外へ渡さず、Esc で閉じられなくなる）
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    const now = stageIn(read().window, stage)?.selection ?? []
    select(pointedSelection(now, anchor, modPressed(e)))
  }
  const open = (e: MouseEvent<HTMLButtonElement>) =>
    follows
      ? pick(e)
      : shown && shown.subject !== note
        ? closePanel(stage)
        : openPanel(stage, { widget: NOTE_PANEL_ID, subject: note, anchors, current: anchor })
  return { open, busy }
}

interface NoteViewProps {
  stage: string
  id: string
  anchors: readonly string[]
  props: NoteProps
}

// AI が読んだ伝言: 物の右上の角に、緑の丸のチェック。物が見える所の外にある間は、縁に緑の丸のチェックのマークポインタ
function ReadNote({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const anchor = anchors.at(-1) ?? ""
  const { open, busy } = useOpenNote(stage, id, anchors)
  return (
    <AtCorner
      anchor={anchor}
      status={READ_NOTE_STATUS_ID}
      at={props.addedAt}
      pointer={<ReadPointer stage={stage} anchor={anchor} center={{ x: POINTER / 2, y: POINTER / 2 }} />}
    >
      <CornerNoteButton
        className={styles.readCheck}
        label={t("Open note")}
        title={t("Read by AI: {text}", { text: clampChars(props.text, BUBBLE_CHARS) })}
        id={id}
        read
        busy={busy}
        onClick={open}
      >
        <ReadCheckIcon />
      </CornerNoteButton>
    </AtCorner>
  )
}

// 読まれていない伝言の、付けた物が見える所の外にある間のマークポインタ（丸の中に伝言の絵。center はスタンドの中の丸の真ん中）。
// 押すと付けた物を見せる。物が広く、見せても吹き出しが入らないときは、代わりに伝言を開く（onOpen）
function NotePointer({
  anchor,
  center,
  onOpen,
}: {
  stage: string
  anchor: string
  center: { x: number; y: number }
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const t = useMessages(kit)
  const opens = useStandAway()?.afterShow === "pointer"
  const show = t("Show {name}", { name: useAnchorName(anchor) })
  return (
    <StandPointer
      center={center}
      size={POINTER}
      label={opens ? t("Open note") : show}
      className={styles.pointer}
      onPress={opens ? onOpen : undefined}
    >
      <NoteIcon />
    </StandPointer>
  )
}

// AI が読んだ伝言の、付けた物が見える所の外にある間のマークポインタ（緑の丸のチェック。押すと付けた物を見せる）
function ReadPointer({ anchor, center }: { stage: string; anchor: string; center: { x: number; y: number } }) {
  const t = useMessages(kit)
  return (
    <StandPointer
      center={center}
      size={POINTER}
      label={t("Show {name}", { name: useAnchorName(anchor) })}
      className={`${styles.readCheck} ${styles.readPointer}`}
    >
      <ReadCheckIcon />
    </StandPointer>
  )
}

// 吹き出しを出す、読まれていない伝言（物の右。入らなければ範囲の右の端で止める）
function BubbleStand({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const anchor = anchors.at(-1) ?? ""
  const { open } = useOpenNote(stage, id, anchors)
  const asks = useNoteAsks(id, "hide")
  return (
    <StandAt anchor={anchor} side="right" turn="none" minRoom={BUBBLE_MIN_W} edgePinned label={t("Note")}>
      <Away
        pointer={
          <NotePointer stage={stage} anchor={anchor} center={{ x: POINTER / 2, y: POINTER / 2 }} onOpen={open} />
        }
      >
        <Ask items={asks} opens="hover" place="aboveRight">
          {() => <BubbleButton text={props.text} onClick={open} />}
        </Ask>
      </Away>
    </StandAt>
  )
}

// たたんだ、読まれていない伝言: 物の右上の角に伝言の絵
function FoldedNote({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const anchor = anchors.at(-1) ?? ""
  const { open, busy } = useOpenNote(stage, id, anchors)
  const asks = useNoteAsks(id, "showOrRemove")
  return (
    <AtCorner
      anchor={anchor}
      status={FOLDED_NOTE_STATUS_ID}
      at={props.addedAt}
      pointer={<NotePointer stage={stage} anchor={anchor} center={{ x: POINTER / 2, y: POINTER / 2 }} onOpen={open} />}
    >
      <FoldedAsk asks={busy ? [] : asks}>
        <CornerNoteButton
          className={styles.folded}
          label={t("Open note")}
          title={clampChars(props.text, BUBBLE_CHARS)}
          id={id}
          busy={busy}
          onClick={open}
        >
          <NoteIcon />
        </CornerNoteButton>
      </FoldedAsk>
    </AtCorner>
  )
}

// 乗せて出す問い: hide は「隠す」（吹き出し）、showOrRemove は「表示」「消す」（たたんだ伝言の絵）。変えられない物は出さない
function useNoteAsks(note: string, kind: "hide" | "showOrRemove"): AskItem[] {
  const t = useMessages(kit)
  const run = usePerformOrToast("The note was refused")
  const updatable = useAllowed(NOTE_UPDATE.id).ok
  const removable = useAllowed(NOTE_REMOVE.id).ok
  const bubble = (on: boolean): AskItem => ({
    question: t(on ? "Show" : "Hide"),
    onYes: () => run(NOTE_UPDATE.id, { note, bubble: on }),
    tone: "plain",
  })
  const remove: AskItem = { question: t("Remove"), onYes: () => run(NOTE_REMOVE.id, { note }), tone: "danger" }
  return kind === "hide"
    ? updatable
      ? [bubble(false)]
      : []
    : [...(updatable ? [bubble(true)] : []), ...(removable ? [remove] : [])]
}

// たたんだ伝言の絵に乗せて出す問い（角の吹き出しの中なら、吹き出しの広がった向きに出す）
function FoldedAsk({ asks, children }: { asks: readonly AskItem[]; children: ReactNode }) {
  const below = useAtCornerBubble() === "below"
  if (asks.length === 0) return children
  return (
    <Ask items={asks} opens="hover" place={below ? "belowRight" : "aboveRight"}>
      {() => children}
    </Ask>
  )
}

// 角に出す伝言の押す物: 右サイドパネルがほかの伝言を出している間（busy）は、薄くして押しても何もしない（付ける先を替えるときは、物を押す）
// （disabled にしないのは、ポインタの出入りの知らせを受け、ツールチップも出すため）
function CornerNoteButton({
  className,
  label,
  title,
  id,
  read = false,
  busy,
  onClick,
  children,
}: {
  className: string | undefined
  label: string
  title: string
  id: string
  read?: boolean
  busy: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const off = busy
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-disabled={off || undefined}
      title={title}
      data-read={read ? "true" : undefined}
      data-note={id}
      onClick={off ? undefined : onClick}
    >
      {children}
    </button>
  )
}

// コーナーステータスの絵（まとめた絵に重ねる。押せない）: たたんだ伝言の絵と既読のチェック
export function FoldedLook() {
  return (
    <span className={styles.folded}>
      <NoteIcon />
    </span>
  )
}
export function ReadCheckLook() {
  return (
    <span className={styles.readCheck}>
      <ReadCheckIcon />
    </span>
  )
}

// 付けた物の上の辺が見える所の外にある間は pointer（マークポインタ）を、そうでなければ children を出す
function Away({ pointer, children }: { pointer: ReactNode; children: ReactNode }) {
  return useStandAway() ? pointer : children
}

// 伝言の吹き出し: 幅は BUBBLE_W で、物の右のいつもの位置から範囲の右の端までがそれより狭ければ、右の端に押されてそこまで縮める（BUBBLE_MIN_W まで。左の端は動かない）
function BubbleButton({ text, onClick }: { text: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const t = useMessages(kit)
  const room = useStandFacing()?.room ?? BUBBLE_W
  return (
    <button
      type="button"
      className={`${styles.bubble} ${styles.opens}`}
      style={{ width: Math.max(BUBBLE_MIN_W, Math.min(BUBBLE_W, room)) }}
      aria-label={t("Open note")}
      onClick={onClick}
    >
      {clampChars(text, BUBBLE_CHARS)}
      <BubbleTail />
    </button>
  )
}

// 吹き出しの尾: 吹き出しの左の、物の下の辺の高さ（吹き出しの下の辺より上なら、そこ）から、左へ短く曲がって細る。
// 縁は外側の 2 つの曲線だけに引き、付け根は吹き出しの地で縁を隠す
function BubbleTail() {
  const facing = useStandFacing()
  if (!facing) return null
  const y = facingY(facing.anchor, { x: 0, y: 0 }, facing.size, 6, TAIL_H + 4)
  return (
    <svg
      className={styles.tail}
      aria-hidden="true"
      width={TAIL_W}
      height={TAIL_H}
      viewBox={`0 0 ${TAIL_W.toString()} ${TAIL_H.toString()}`}
      style={{ top: y - TAIL_H }}
    >
      <path className={styles.tailFill} d="M14 0 L14 12 C9 12 4 14 0 16 C4 11 9 6 14 0 Z" />
      <path className={styles.tailEdge} d="M14 12 C9 12 4 14 0 16 C4 11 9 6 14 0" />
    </svg>
  )
}

// AI が読んだ伝言の印のチェック（緑の丸の中）
function ReadCheckIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" data-read-check>
      <path d="M3 6.2l2 2 4-4.4" />
    </svg>
  )
}

// 伝言の絵（たたんだ伝言と、送信トレイの行に出す）
export function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
