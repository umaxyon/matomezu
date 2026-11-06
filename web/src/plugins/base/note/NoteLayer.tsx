// 伝言のレイヤー（ウィジェット note-layer）: 開いているブックの伝言を、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出す伝言は物の右に、文の始め（BUBBLE_CHARS 字）だけの吹き出しを、物の方へ曲がる尾を付けて出し、たたんだ伝言は物の右上の角に伝言の絵を出す。
// AI が読んだ伝言は、吹き出しも絵も出さず、物の右上の角に緑の丸のチェックを出す（吹き出しを出すかのデータは変えない）。
// 角の絵とチェックは、角に出すほかの物（マークなど）と一緒に角のスタンドにまとまる（utils/corner.tsx。2 つ以上なら、乗せると広がる吹き出しから 1 つずつ選ぶ）。
// 角の中の並びは、マークの後に、たたんだ伝言、既読の伝言の順で、それぞれ付けた時点の新しい順。
// 読まれていない伝言は、付けた物の上の辺が見える所の外に出たら、吹き出しか絵の代わりにマークポインタ（丸の中に伝言の絵）を縁に出し、押すと付けた物を見せる。読まれた伝言は縁に出さない。
// 吹き出しか絵かチェックを押すと、右サイドパネルにその伝言を出す（付けた先を選び、吹き出しの物をカレントにする。吹き出しを出すかのデータは変えない）。
// 選択に従う右サイドパネルの中身（書いている伝言など）を出している間は、吹き出しの物を押したのと同じにする（選ぶ。Mod なら足す・外す。書きかけを生かす）。
// 右サイドパネルがほかの物を出している間は、角の吹き出しの中の絵とチェックは薄くして押せなくし、それ以外（物の右の吹き出し・角に 1 つだけの絵とチェック）は押すと閉じるだけ。
// 吹き出しの色はスキンの bubble だけで、物や伝言の様子では変えない。右サイドパネルが伝言を出している間は、付ける先に鳥を出す（NoteBirds）
import type { MouseEvent, ReactNode } from "react"
import { useMessages } from "../../../ui/i18n"
import { useActions, useReadState } from "../../../ui/store-context"
import { useAnnotationsOf } from "../annotation-hooks"
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
import { Stand, useStandAway, useStandFacing } from "../utils/anchors"
import { AtCorner, useAtCornerBubble } from "../utils/corner"
import { StandPointer } from "../utils/StandPointer"
import { standFacing } from "../utils/stand-place"
import { modPressed } from "../utils/ui"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, type NoteProps } from "."
import { NoteBirds } from "./NoteBirds"
import styles from "./NoteLayer.module.css"
import { NEW_NOTE, NOTE_PANEL_ID } from "./panel-id"

export const BUBBLE_CHARS = 20 // 吹き出しに出す、文の始めの字数（送信トレイの行も同じ）
const POINTER = 24 // マークポインタの丸の大きさ（マークと同じ）
const FOLDED_ORDER = 10 // 角の並びの順（マークの 0 の後に、たたんだ伝言、既読の伝言）
const READ_ORDER = 20
const TAIL_W = 14 // 吹き出しの尾の幅と高さ（尾の先は左下）
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
// busy は、右サイドパネルが、新しく書いている伝言でもこの伝言でもない物を出しているか（角の吹き出しの中の絵とチェックは、その間は薄くして押せない）
function useOpenNote(stage: string, note: string, anchors: readonly string[]) {
  const openPanel = useOpenRightSidePanel()
  const closePanel = useCloseRightSidePanel()
  const shown = useRightSidePanel(stage)
  const follows = useFollowsSelection(stage)
  const read = useReadState()
  const { select } = useActions()
  const anchor = anchors.at(-1) ?? ""
  const busy = !!shown && shown.subject !== note && shown.subject !== NEW_NOTE
  // 物を押したときと同じく、焦点はスタンドに残さない（スタンドはキーを外へ渡さず、Esc で閉じられなくなる）
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    const now = read().workspace.stages.find(s => s.id === stage)?.selection ?? []
    select(stage, pointedSelection(now, anchor, modPressed(e)))
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

// AI が読んだ伝言: 物の右上の角に、緑の丸のチェック（角の並びでは、たたんだ伝言の後）
function ReadNote({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const { open, busy } = useOpenNote(stage, id, anchors)
  return (
    <AtCorner anchor={anchors.at(-1) ?? ""} order={READ_ORDER} at={props.addedAt} look={<ReadCheckLook />}>
      <CornerNoteButton
        className={styles.readCheck}
        label={t("Open note")}
        title={clampChars(props.text, BUBBLE_CHARS)}
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

// 読まれていない伝言の、付けた物が見える所の外にある間のマークポインタ（丸の中に伝言の絵。center はスタンドの中の丸の真ん中）
function NotePointer({ stage, anchor, center }: { stage: string; anchor: string; center: { x: number; y: number } }) {
  const t = useMessages(kit)
  const label = t("Show {name}", { name: useAnchorName(stage, anchor) })
  return (
    <StandPointer center={center} size={POINTER} label={label} className={styles.pointer}>
      <NoteIcon />
    </StandPointer>
  )
}

// 吹き出しを出す、読まれていない伝言（物の右）
function BubbleStand({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const anchor = anchors.at(-1) ?? ""
  const { open } = useOpenNote(stage, id, anchors)
  return (
    <Stand anchor={anchor} side="right" edgePinned label={t("Note")}>
      <Away pointer={<NotePointer stage={stage} anchor={anchor} center={{ x: POINTER / 2, y: POINTER / 2 }} />}>
        <button type="button" className={`${styles.bubble} ${styles.opens}`} aria-label={t("Open note")} onClick={open}>
          {clampChars(props.text, BUBBLE_CHARS)}
          <BubbleTail />
        </button>
      </Away>
    </Stand>
  )
}

// たたんだ、読まれていない伝言: 物の右上の角に伝言の絵（角の並びでは、マークの後）
function FoldedNote({ stage, id, anchors, props }: NoteViewProps) {
  const t = useMessages(kit)
  const anchor = anchors.at(-1) ?? ""
  const { open, busy } = useOpenNote(stage, id, anchors)
  return (
    <AtCorner
      anchor={anchor}
      order={FOLDED_ORDER}
      at={props.addedAt}
      look={<FoldedLook />}
      pointer={<NotePointer stage={stage} anchor={anchor} center={{ x: POINTER / 2, y: POINTER / 2 }} />}
    >
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
    </AtCorner>
  )
}

// 角に出す伝言の押す物: 吹き出しの中で、右サイドパネルがほかの物を出している間（busy）は、薄くして押しても何もしない
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
  const bubble = useAtCornerBubble()
  const off = busy && bubble !== "none"
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

// まとめた絵に重ねる、たたんだ伝言の絵と既読のチェック（押せない）
function FoldedLook() {
  return (
    <span className={styles.folded}>
      <NoteIcon />
    </span>
  )
}
function ReadCheckLook() {
  return (
    <span className={styles.readCheck}>
      <ReadCheckIcon />
    </span>
  )
}

// 付けた物の上の辺が見える所の外にある間は pointer（マークポインタ。読まれた伝言では何も出さない）を、そうでなければ children を出す
function Away({ pointer, children }: { pointer: ReactNode; children: ReactNode }) {
  return useStandAway() ? pointer : children
}

// 吹き出しの尾: 吹き出しの物の側（左か右）の、物の下の辺の高さ（吹き出しの下の辺より上なら、そこ）から、物の方へ短く曲がって細る。
// 縁は外側の 2 つの曲線だけに引き、付け根は吹き出しの地で縁を隠す
function BubbleTail() {
  const facing = useStandFacing()
  if (!facing) return null
  const { side, y } = standFacing(facing.anchor, { x: 0, y: 0 }, facing.size, 6, TAIL_H + 4)
  return (
    <svg
      className={styles.tail}
      data-side={side}
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
