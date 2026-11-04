// 伝言のレイヤー（ウィジェット note-layer）: 開いているブックの伝言を、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出す伝言は物の右に、文の始め（BUBBLE_CHARS 字）だけの吹き出しを、たたんだ伝言は物の右上の角に伝言の絵を出す。
// 吹き出しか絵を押すと、右サイドパネルにその伝言を出す（付けた先を選び、吹き出しの物をカレントにする。吹き出しを出すかのデータは変えない）。
// 選択に従う右サイドパネルの中身（書いている伝言など）を出している間は、吹き出しの物を押したのと同じにする（選ぶ。Mod なら足す・外す。書きかけを生かす）。右サイドパネルがほかの物を出している間に押したら、閉じるだけ。
// 吹き出しの色はスキンの bubble だけで、物や伝言の様子では変えない。右サイドパネルが伝言を出している間は、付ける先に鳥を出す（NoteBirds）
import type { MouseEvent } from "react"
import { useMessages } from "../../../ui/i18n"
import { useActions, useReadState } from "../../../ui/store-context"
import { useAnnotationsOf } from "../annotation-hooks"
import { kit } from "../kit"
import {
  useCloseRightSidePanel,
  useFollowsSelection,
  useOpenRightSidePanel,
  useRightSidePanel,
} from "../right-side-panel/hooks"
import { pointedSelection } from "../right-side-panel/state"
import { clampChars } from "../text/text"
import { Stand } from "../utils/anchors"
import { modPressed } from "../utils/ui"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, type NoteProps } from "."
import { NoteBirds } from "./NoteBirds"
import styles from "./NoteLayer.module.css"
import { NOTE_PANEL_ID } from "./panel-id"

export const BUBBLE_CHARS = 20 // 吹き出しに出す、文の始めの字数（伝言一覧の行も同じ）

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
  if (props.bubble)
    return (
      <Stand anchor={anchor} side="right" label={t("Note")}>
        <button type="button" className={`${styles.bubble} ${styles.opens}`} aria-label={t("Open note")} onClick={open}>
          {clampChars(props.text, BUBBLE_CHARS)}
        </button>
      </Stand>
    )
  return (
    <Stand anchor={anchor} side="corner" label={t("Note")}>
      <button type="button" className={styles.folded} aria-label={t("Open note")} onClick={open}>
        <NoteIcon />
      </button>
    </Stand>
  )
}

// 伝言の絵（たたんだ伝言と、伝言一覧の行に出す）
export function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
