// 伝言の右サイドパネルの中身（ウィジェット note-panel）: 右サイドパネルが見せている伝言の文をテキストFormで出し、変えたら保存する（保存せずに閉じたら変えない）。
// 「伝わったら自動で消す」・吹き出しを出すか（たたむ）・消すは、押したときに変える。変えられなければ（認可ステップが止めたなど）、どれも始められない。
// その伝言が無くなったら（AI が読んで消えたなど）、黙って右サイドパネルを閉じる
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useAllowed } from "../../../ui/view-hooks"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_REMOVE, NOTE_UPDATE, type NoteProps } from "."
import { GrowingText, RemoveOnRead } from "./NoteForm"
import form from "./NoteForm.module.css"
import styles from "./NotePanel.module.css"

export function NotePanel({ stage }: StageSlotProps) {
  const open = useRightSidePanel(stage)
  const notes = useAnnotationsOf(stage, NOTE.id)
  const close = useCloseRightSidePanel()
  const note = open ? notes.find(n => n.id === open.subject) : undefined
  const gone = !!open && !note
  useEffect(() => {
    if (gone) close(stage)
  }, [gone, close, stage])
  if (!note) return null
  const props = note.props as NoteProps
  // 文が外で変わったら、テキストFormを新しい文で始め直す
  return <NoteEditor key={`${note.id}:${props.text}`} stage={stage} id={note.id} props={props} />
}

function NoteEditor({ stage, id, props }: { stage: string; id: string; props: NoteProps }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const updatable = useAllowed(stage, NOTE_UPDATE.id).ok
  const removable = useAllowed(stage, NOTE_REMOVE.id).ok
  const [text, setText] = useState(props.text)
  const changed = updatable && text.trim() !== "" && text !== props.text
  const save = () => {
    if (changed) run(NOTE_UPDATE.id, { note: id, text })
  }
  return (
    <div className={styles.panel}>
      <GrowingText
        value={text}
        onChange={setText}
        placeholder={t("Note…")}
        onSubmit={save}
        label={t("Note")}
        readOnly={!updatable}
      />
      <RemoveOnRead
        disabled={!updatable}
        checked={props.removeOnRead}
        onChange={removeOnRead => run(NOTE_UPDATE.id, { note: id, removeOnRead })}
      />
      <div className={form.buttons}>
        <button type="button" className={form.primary} disabled={!changed} onClick={save}>
          {t("Save")}
        </button>
        <button
          type="button"
          className={form.button}
          disabled={!updatable}
          onClick={() => run(NOTE_UPDATE.id, { note: id, bubble: !props.bubble })}
        >
          {t(props.bubble ? "Fold" : "Show bubble")}
        </button>
        <button
          type="button"
          className={form.danger}
          disabled={!removable}
          onClick={() => run(NOTE_REMOVE.id, { note: id })}
        >
          {t("Remove")}
        </button>
      </div>
    </div>
  )
}
