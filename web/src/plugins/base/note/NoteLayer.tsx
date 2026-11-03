// 伝言のレイヤー（ウィジェット note-layer）: 開いているブックの伝言を、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出す伝言は物の右に、文の始め（BUBBLE_CHARS 字）だけの吹き出しを、たたんだ伝言は物の右上の角に伝言の絵を出す。
// 吹き出しか絵を押すと、右サイドパネルにその伝言を出す（吹き出しを出すかのデータは変えない）。
// 伝言の下書き（commands.ts の NOTE_DRAFT）があれば、その吹き出しも出す。吹き出しの色はスキンの bubble だけで、物や伝言の様子では変えない
import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import { kit } from "../kit"
import { useOpenRightSidePanel } from "../right-side-panel/hooks"
import { clampChars } from "../text/text"
import { Stand } from "../utils/anchors"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_ADD, type NoteProps } from "."
import { NOTE_DRAFT } from "./commands"
import { GrowingText, RemoveOnRead } from "./NoteForm"
import form from "./NoteForm.module.css"
import styles from "./NoteLayer.module.css"
import { NOTE_PANEL_ID } from "./panel-id"

const BUBBLE_CHARS = 20 // 吹き出しに出す、文の始めの字数

export function NoteLayer({ stage }: StageSlotProps) {
  const notes = useAnnotationsOf(stage, NOTE.id)
  const draft = useAnchorTargets(stage, NOTE_DRAFT)
  return (
    <>
      {notes.map(n => (
        <NoteStand key={n.id} stage={stage} id={n.id} anchor={n.anchors.at(-1) ?? ""} props={n.props as NoteProps} />
      ))}
      {draft && <DraftStand key={draft.anchors.join(" ")} stage={stage} draft={draft} />}
    </>
  )
}

function NoteStand({ stage, id, anchor, props }: { stage: string; id: string; anchor: string; props: NoteProps }) {
  const t = useMessages(kit)
  const openPanel = useOpenRightSidePanel()
  const open = () => openPanel(stage, { widget: NOTE_PANEL_ID, subject: id, anchor })
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

// 伝言の下書きの吹き出し: 文と「伝わったら自動で消す」を選び、付ける。Esc かキャンセルで、付けずに閉じる
function DraftStand({ stage, draft }: { stage: string; draft: AnchorTargets }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const [text, setText] = useState("")
  const [removeOnRead, setRemoveOnRead] = useState(true)
  const setDraft = useSetAnchorTargets(NOTE_DRAFT)
  const end = () => setDraft(stage, null)
  const add = () => {
    if (text.trim() !== "" && run(NOTE_ADD.id, { anchors: [...draft.anchors], text, removeOnRead })) end()
  }
  return (
    <Stand anchor={draft.anchors.at(-1) ?? ""} side="right" label={t("Add note")}>
      <div className={styles.bubble}>
        <GrowingText
          value={text}
          onChange={setText}
          placeholder={t("Note…")}
          onSubmit={add}
          onEscape={end}
          label={t("Note")}
          autoFocus
        />
        <RemoveOnRead checked={removeOnRead} onChange={setRemoveOnRead} />
        <div className={form.buttons}>
          <button type="button" className={form.primary} disabled={text.trim() === ""} onClick={add}>
            {t("Add")}
          </button>
          <button type="button" className={form.button} onClick={end}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </Stand>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
