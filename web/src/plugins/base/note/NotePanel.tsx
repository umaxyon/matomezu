// 伝言の右サイドパネルの中身（ウィジェット note-panel）: ステージの選択に従い、選んだ物が付ける先になる（右サイドパネルの anchors。カレントは current）。
// 上に付ける先の名前のバッジを並べ（カレントは色違い）、押すとその物をカレントにする（右サイドパネルが、倍率はそのままで真ん中へ見せる）。
// 新しく書く（subject が NEW_NOTE）なら、文を書いて「付ける」。付けた伝言なら、文を直すか付ける先を変えて「再送」。
// どちらも付ける先はカレントを最後に並べて渡し、吹き出しはカレントに出る。付けるか再送したら閉じる（閉じたら選択を外すのは右サイドパネル）。
// 書いている間に付ける先の物がブックから消えたら（AI が消したなど）、閉じずにテキストFormの上に知らせ、書きかけはそのまま残す（付ける先が無い間は付けられない）。
// 吹き出しを出すか（たたむ）・消すは、付けた伝言では押したときに変える。変えられなければ（認可ステップが止めたなど）、どれも始められない。
// 付けた伝言は、文か付ける先を変えてから、再送するか閉じるまで編集ロックを掛ける（AI が変えも消しもしない。開いて見ているだけなら掛けない）。付けた伝言が無くなったら（利用者がほかの窓で消したなど）、黙って右サイドパネルを閉じる
import { useEffect, useRef, useState } from "react"
import { anchorIds } from "../../../core/annotation"
import { useMessages } from "../../../ui/i18n"
import { useAllowed, useBook, useUserSetting } from "../../../ui/view-hooks"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useCloseRightSidePanel, useRightSidePanel, useSetRightSidePanelCurrent } from "../right-side-panel/hooks"
import type { RightSidePanelOpen } from "../right-side-panel/state"
import { clampChars } from "../text/text"
import { useEditLock } from "../utils/useEditLock"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_ADD, NOTE_REMOVE, NOTE_UPDATE, type NoteProps, NoteTextSchema } from "."
import { expiryOutlook, hoursAndMinutes, NOTE_EXPIRY } from "./expiry"
import { GrowingText } from "./NoteForm"
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

// 新しく書く伝言: 文を書いて「付ける」（付ける先が無い間は付けられない）
function NewNote({ stage, open }: { stage: string; open: RightSidePanelOpen }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const close = useCloseRightSidePanel()
  const addable = useAllowed(stage, NOTE_ADD.id).ok
  const [text, setText] = useState("")
  const ready = addable && NoteTextSchema.safeParse(text).success && open.anchors.length > 0
  const add = () => {
    if (ready && run(NOTE_ADD.id, { anchors: ordered(open), text })) close(stage)
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
      <div className={form.buttons}>
        <button type="button" className={form.primary} disabled={!ready} onClick={add}>
          {t("Add")}
        </button>
      </div>
    </>
  )
}

// 付けた伝言: 文を直すか付ける先を変えて「再送」。たたむ・消すは、押したときに変える
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
  const next = ordered(open)
  const moved = next.length !== anchors.length || next.some((a, i) => anchors[i] !== a)
  // 文か付ける先を一度変えたら、閉じるまで、この伝言を AI が変えも消しもしない（読んだと知らせるのも。付いた物を消して伝言が変わるのも）
  const [edited, setEdited] = useState(false)
  const editing = text !== props.text || moved
  useEffect(() => {
    if (editing) setEdited(true)
  }, [editing])
  useEditLock(open.book, edited || editing ? [id] : [])
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
      <ExpiryNote props={props} />
      <div className={form.buttons}>
        <button type="button" className={form.primary} disabled={!changed} onClick={save}>
          {t("Resend")}
        </button>
        {props.readAt === undefined && (
          <button
            type="button"
            className={form.button}
            disabled={!updatable}
            onClick={() => run(NOTE_UPDATE.id, { note: id, bubble: !props.bubble })}
          >
            {t(props.bubble ? "Fold" : "Show bubble")}
          </button>
        )}
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

// 読まれた伝言が消えるまでの見込み（まだ話しかけていなければ、話しかけてからの時間。数え始めたら残りで、30 秒ごとに見直す。消さない設定なら出さない）
function ExpiryNote({ props }: { props: NoteProps }) {
  const t = useMessages(kit)
  const choice = useUserSetting(NOTE_EXPIRY.id)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const outlook = expiryOutlook(props, choice, now)
  if (!outlook) return null
  const time = (minutes: number) => {
    const { h, m } = hoursAndMinutes(minutes)
    if (h === 0) return t("{n} min", { n: m })
    return m === 0 ? t("{h} h", { h }) : t("{h} h {m} min", { h, m })
  }
  const text =
    outlook.kind === "after-talk"
      ? outlook.minutes === 0
        ? t("Removed as soon as you talk to AI")
        : t("Removed {time} after you talk to AI", { time: time(outlook.minutes) })
      : outlook.minutes === 0
        ? t("Read by AI. Removed soon")
        : t("Read by AI. Removed in {time}", { time: time(outlook.minutes) })
  return (
    <p className={styles.expiry} data-note-expiry>
      {text}
    </p>
  )
}
