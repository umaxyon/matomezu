// 伝言のレイヤー（ウィジェット note-layer）: 開いているブックの伝言を、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出す伝言は物の右に、文の始め（BUBBLE_CHARS 字）だけの吹き出しを、物の方へ曲がる尾を付けて出し、たたんだ伝言は物の右上の角に伝言の絵を出す。
// AI が読んだ伝言は、吹き出しも絵も出さず、物の右上の角に緑の丸のチェックを出す（吹き出しを出すかのデータは変えない）。
// 読まれていない伝言は、付けた物の上の辺が見える所の外に出たら、吹き出しか絵の代わりにマークポインタ（丸の中に伝言の絵）を縁に出し、押すと付けた物を見せる。読まれた伝言は縁に出さない。
// 吹き出しか絵を押すと、右サイドパネルにその伝言を出す（付けた先を選び、吹き出しの物をカレントにする。吹き出しを出すかのデータは変えない）。
// 選択に従う右サイドパネルの中身（書いている伝言など）を出している間は、吹き出しの物を押したのと同じにする（選ぶ。Mod なら足す・外す。書きかけを生かす）。右サイドパネルがほかの物を出している間に押したら、閉じるだけ。
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
import { StandPointer } from "../utils/StandPointer"
import { standFacing } from "../utils/stand-place"
import { modPressed } from "../utils/ui"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, type NoteProps } from "."
import { NoteBirds } from "./NoteBirds"
import styles from "./NoteLayer.module.css"
import { NOTE_PANEL_ID } from "./panel-id"

export const BUBBLE_CHARS = 20 // 吹き出しに出す、文の始めの字数（送信トレイの行も同じ）
const POINTER = 24 // マークポインタの丸の大きさ（マークと同じ）
const TAIL_W = 14 // 吹き出しの尾の幅と高さ（尾の先は左下）
const TAIL_H = 16

export function NoteLayer({ stage }: StageSlotProps) {
  const notes = useAnnotationsOf(stage, NOTE.id)
  return (
    <>
      {notes.map(n => (
        <NoteStand key={n.id} stage={stage} id={n.id} anchors={n.anchors} props={n.props as NoteProps} />
      ))}
      <NoteBirds stage={stage} />
    </>
  )
}

function NoteStand({
  stage,
  id,
  anchors,
  props,
}: {
  stage: string
  id: string
  anchors: readonly string[]
  props: NoteProps
}) {
  const t = useMessages(kit)
  const openPanel = useOpenRightSidePanel()
  const closePanel = useCloseRightSidePanel()
  const shown = useRightSidePanel(stage)
  const follows = useFollowsSelection(stage)
  const read = useReadState()
  const { select } = useActions()
  const anchor = anchors.at(-1) ?? ""
  // 吹き出しの物を押したのと同じに選ぶ（Mod なら足す・外す）。物を押したときと同じく、焦点はスタンドに残さない（スタンドはキーを外へ渡さず、Esc で閉じられなくなる）
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    const now = read().workspace.stages.find(s => s.id === stage)?.selection ?? []
    select(stage, pointedSelection(now, anchor, modPressed(e)))
  }
  const open = (e: MouseEvent<HTMLButtonElement>) =>
    follows
      ? pick(e)
      : shown && shown.subject !== id
        ? closePanel(stage)
        : openPanel(stage, { widget: NOTE_PANEL_ID, subject: id, anchors, current: anchor })
  const awayLabel = t("Show {name}", { name: useAnchorName(stage, anchor) })
  if (props.readAt !== undefined)
    return (
      <Stand anchor={anchor} side="corner" edgePinned label={t("Note")}>
        <Away pointer={null}>
          <button
            type="button"
            className={styles.readCheck}
            aria-label={t("Open note")}
            title={t("Read by AI")}
            data-read="true"
            onClick={open}
          >
            <ReadCheckIcon />
          </button>
        </Away>
      </Stand>
    )
  const pointer = (
    <StandPointer
      center={{ x: POINTER / 2, y: POINTER / 2 }}
      size={POINTER}
      label={awayLabel}
      className={styles.pointer}
    >
      <NoteIcon />
    </StandPointer>
  )
  if (props.bubble)
    return (
      <Stand anchor={anchor} side="right" edgePinned label={t("Note")}>
        <Away pointer={pointer}>
          <button
            type="button"
            className={`${styles.bubble} ${styles.opens}`}
            aria-label={t("Open note")}
            onClick={open}
          >
            {clampChars(props.text, BUBBLE_CHARS)}
            <BubbleTail />
          </button>
        </Away>
      </Stand>
    )
  return (
    <Stand anchor={anchor} side="corner" edgePinned label={t("Note")}>
      <Away pointer={pointer}>
        <button type="button" className={styles.folded} aria-label={t("Open note")} onClick={open}>
          <NoteIcon />
        </button>
      </Away>
    </Stand>
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
