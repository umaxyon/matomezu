// 伝言の右サイドパネルの中身（ウィジェット note-panel）: ステージの選択に従い、選んだ物が付ける先になる（右サイドパネルの anchors。カレントは current）。
// 上に付ける先の名前のバッジを並べ（カレントは色違い）、押すとその物をカレントにする（右サイドパネルが、倍率はそのままで真ん中へ見せる）。
// 新しく書く（subject が NEW_NOTE）なら、文と「伝わったら自動で消す」を書いて「付ける」。付けた伝言なら、文を直すか付ける先を変えて「保存」。
// どちらも付ける先はカレントを最後に並べて渡し、吹き出しはカレントに出る。付けるか保存したら閉じる（閉じたら選択を外すのは右サイドパネル）。
// 書いている間に付ける先の物がブックから消えたら（AI が消したなど）、閉じずにテキストFormの上に知らせ、書きかけはそのまま残す（付ける先が無い間は付けられない）。
// 「伝わったら自動で消す」・吹き出しを出すか（たたむ）・消すは、付けた伝言では押したときに変える。変えられなければ（認可ステップが止めたなど）、どれも始められない。
// 付けた伝言は、開いている間、編集ロックを掛ける（AI が変えも消しもしない）。付けた伝言が無くなったら（利用者がほかの窓で消したなど）、黙って右サイドパネルを閉じる
import { useEffect, useRef, useState } from "react"
import { anchorIds } from "../../../core/annotation"
import { useMessages } from "../../../ui/i18n"
import { useAllowed, useBook } from "../../../ui/view-hooks"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useCloseRightSidePanel, useRightSidePanel, useSetRightSidePanelCurrent } from "../right-side-panel/hooks"
import type { RightSidePanelOpen } from "../right-side-panel/state"
import { clampChars } from "../text/text"
import { useEditLock } from "../utils/useEditLock"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_ADD, NOTE_REMOVE, NOTE_UPDATE, type NoteProps, NoteTextSchema } from "."
import { GrowingText, RemoveOnRead } from "./NoteForm"
import form from "./NoteForm.module.css"
import styles from "./NotePanel.module.css"
import { NEW_NOTE } from "./panel-id"

const BADGE_CHARS = 10 // バッジに出す、名前の始めの字数

export function NotePanel({ stage }: StageSlotProps) {
  const open = useRightSidePanel(stage)
  const notes = useAnnotationsOf(stage, NOTE.id)
  const close = useCloseRightSidePanel()
  const note = open ? notes.find(n => n.id === open.subject) : undefined
  const gone = !!open && open.subject !== NEW_NOTE && !note
  useEffect(() => {
    if (gone) close(stage)
  }, [gone, close, stage])
  if (!open || (open.subject !== NEW_NOTE && !note)) return null
  return (
    <div className={styles.panel}>
      <Badges stage={stage} open={open} />
      <Lost stage={stage} anchors={open.anchors} />
      {note ? (
        // 文が外で変わったら、テキストFormを新しい文で始め直す
        <NoteEditor
          key={`${note.id}:${(note.props as NoteProps).text}`}
          stage={stage}
          id={note.id}
          anchors={note.anchors}
          props={note.props as NoteProps}
          open={open}
        />
      ) : (
        <NewNote stage={stage} open={open} />
      )}
    </div>
  )
}

// 付ける先 open.anchors を、カレントを最後にした並び（吹き出しはカレントに出る）
const ordered = (open: RightSidePanelOpen): string[] =>
  open.anchors.includes(open.current)
    ? [...open.anchors.filter(id => id !== open.current), open.current]
    : [...open.anchors]

// 付ける先の名前のバッジ: カレントは色違い。押すとその物をカレントにする。名前は BADGE_CHARS 字で切り、全体はツールチップで見せる
function Badges({ stage, open }: { stage: string; open: RightSidePanelOpen }) {
  const t = useMessages(kit)
  return (
    // biome-ignore lint/a11y/useSemanticElements: バッジを束ねる並びで、入力Formのまとまり（fieldset）ではない
    <div className={styles.badges} role="group" aria-label={t("Things the note is on")}>
      {open.anchors.map(id => (
        <Badge key={id} stage={stage} id={id} current={id === open.current} />
      ))}
    </div>
  )
}

function Badge({ stage, id, current }: { stage: string; id: string; current: boolean }) {
  const setCurrent = useSetRightSidePanelCurrent()
  const name = useAnchorName(stage, id)
  return (
    <button
      type="button"
      className={styles.badge}
      aria-pressed={current}
      title={name}
      onClick={() => setCurrent(stage, id)}
    >
      {clampChars(name, BADGE_CHARS)}
    </button>
  )
}

// 付ける先の物がブックから消えたら（AI が消したなど）出す知らせ（閉じるまで出したまま）
function Lost({ stage, anchors }: { stage: string; anchors: readonly string[] }) {
  const t = useMessages(kit)
  const book = useBook(stage)
  const [lost, setLost] = useState(false)
  const before = useRef(anchors)
  useEffect(() => {
    const ids = book ? anchorIds(book) : new Set<string>()
    if (before.current.some(id => !anchors.includes(id) && !ids.has(id))) setLost(true)
    before.current = anchors
  }, [anchors, book])
  return lost ? (
    <p className={styles.lost} role="status">
      {t("A thing the note was on was removed")}
    </p>
  ) : null
}

// 新しく書く伝言: 文と「伝わったら自動で消す」を書いて「付ける」（付ける先が無い間は付けられない）
function NewNote({ stage, open }: { stage: string; open: RightSidePanelOpen }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const close = useCloseRightSidePanel()
  const addable = useAllowed(stage, NOTE_ADD.id).ok
  const [text, setText] = useState("")
  const [removeOnRead, setRemoveOnRead] = useState(true)
  const ready = addable && NoteTextSchema.safeParse(text).success && open.anchors.length > 0
  const add = () => {
    if (ready && run(NOTE_ADD.id, { anchors: ordered(open), text, removeOnRead })) close(stage)
  }
  return (
    <>
      <GrowingText
        value={text}
        onChange={setText}
        placeholder={t("Note…")}
        onSubmit={add}
        label={t("Note")}
        autoFocus
      />
      <RemoveOnRead checked={removeOnRead} onChange={setRemoveOnRead} />
      <div className={form.buttons}>
        <button type="button" className={form.primary} disabled={!ready} onClick={add}>
          {t("Add")}
        </button>
      </div>
    </>
  )
}

// 付けた伝言: 文を直すか付ける先を変えて「保存」。「伝わったら自動で消す」・たたむ・消すは、押したときに変える
function NoteEditor({
  stage,
  id,
  anchors,
  props,
  open,
}: {
  stage: string
  id: string
  anchors: readonly string[]
  props: NoteProps
  open: RightSidePanelOpen
}) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const close = useCloseRightSidePanel()
  const updatable = useAllowed(stage, NOTE_UPDATE.id).ok
  const removable = useAllowed(stage, NOTE_REMOVE.id).ok
  const [text, setText] = useState(props.text)
  // 開いている間は、この伝言を AI が変えも消しもしない（読んだと知らせるのも。付いた物を消して伝言が変わるのも）
  useEditLock(open.book, [id])
  const next = ordered(open)
  const moved = next.length !== anchors.length || next.some((a, i) => anchors[i] !== a)
  const textChanged = NoteTextSchema.safeParse(text).success && text !== props.text
  const changed = updatable && next.length > 0 && (textChanged || moved)
  const save = () => {
    if (!changed) return
    const done = run(NOTE_UPDATE.id, {
      note: id,
      ...(textChanged ? { text } : {}),
      ...(moved ? { anchors: next } : {}),
    })
    if (done) close(stage)
  }
  return (
    <>
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
    </>
  )
}
