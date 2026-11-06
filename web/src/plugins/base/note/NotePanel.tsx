// 伝言の右サイドパネルの中身（ウィジェット note-panel）: ステージの選択に従い、選んだ物が付ける先になる（右サイドパネルの anchors。カレントは current）。
// 上に付ける先の名前のバッジを並べ（カレントは色違い）、押すとその物をカレントにする（右サイドパネルが、倍率はそのままで真ん中へ見せる）。
// 新しく書く（subject が NEW_NOTE）なら、文を書いて「付ける」。付けた伝言なら、文を直すか付ける先を変えて「再送」。
// どちらも付ける先はカレントを最後に並べて渡し、吹き出しはカレントに出る。付けるか再送したら閉じる（閉じたら選択を外すのは右サイドパネル）。
// 既読の伝言なら、同じ物にチェックを出す既読の伝言（read-groups.ts）を、伝言ごと（バッジ・テキストForm・消えるまでの見込み・ボタン）に線で区切って新しい順に並べ、
// subject の伝言が途中にあれば、そこまでスクロールする。付ける先・カレント・鳥は subject の伝言だけが持ち、ほかの伝言のバッジは押すとその物を見せるだけ（付ける先は変えない）。
// subject の既読の伝言が無くなったら（消した・期限で消えたなど）、同じ物の次に新しい既読の伝言を subject にして開いたままにする（無ければ閉じる）。
// 書いている間に付ける先の物がブックから消えたら（AI が消したなど）、閉じずにテキストFormの上に知らせ、書きかけはそのまま残す（付ける先が無い間は付けられない）。
// 吹き出しを出すか（たたむ）・消すは、付けた伝言では押したときに変える。変えられなければ（認可ステップが止めたなど）、どれも始められない。
// 付けた伝言は、文か付ける先を変えてから、再送するか閉じるまで編集ロックを掛ける（AI が変えも消しもしない。開いて見ているだけなら掛けない）。付けた伝言が無くなり、同じ物に既読の伝言が残っていなければ（利用者がほかの窓で消したなど）、黙って右サイドパネルを閉じる
import { useEffect, useMemo, useRef, useState } from "react"
import type { Annotation } from "../../../core/annotation"
import { anchorIds } from "../../../core/annotation"
import { useMessages } from "../../../ui/i18n"
import { useAllowed, useBook, useUserSetting } from "../../../ui/view-hooks"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import {
  useCloseRightSidePanel,
  useReplaceRightSidePanelSubject,
  useRightSidePanel,
  useScrollRightSidePanelTo,
  useSetRightSidePanelCurrent,
} from "../right-side-panel/hooks"
import type { RightSidePanelOpen } from "../right-side-panel/state"
import { clampChars } from "../text/text"
import { useRequestReveal } from "../utils/reveal-request"
import { useEditLock } from "../utils/useEditLock"
import type { StageSlotProps } from "../workspace/ui"
import { NOTE, NOTE_ADD, NOTE_REMOVE, NOTE_UPDATE, type NoteProps, NoteTextSchema } from "."
import { expiryOutlook, hoursAndMinutes, NOTE_EXPIRY } from "./expiry"
import { GrowingText } from "./NoteForm"
import form from "./NoteForm.module.css"
import styles from "./NotePanel.module.css"
import { NEW_NOTE } from "./panel-id"
import { nextReadNote, readNotesByAnchor } from "./read-groups"

const BADGE_CHARS = 10 // バッジに出す、名前の始めの字数

export function NotePanel({ stage }: StageSlotProps) {
  const open = useRightSidePanel(stage)
  const notes = useAnnotationsOf(stage, NOTE.id)
  const close = useCloseRightSidePanel()
  const replace = useReplaceRightSidePanelSubject()
  const note = open ? notes.find(n => n.id === open.subject) : undefined
  const gone = !!open && open.subject !== NEW_NOTE && !note
  // 開いた既読の伝言のチェックを出す物（その伝言が無くなったら、同じ物の次に新しい既読の伝言を開く。消えたことを見る effect より前に覚える）
  const readAnchor = useRef<string | null>(null)
  useEffect(() => {
    if (note) readAnchor.current = (note.props as NoteProps).readAt !== undefined ? (note.anchors.at(-1) ?? null) : null
  }, [note])
  useEffect(() => {
    if (!gone) return
    const next = readAnchor.current === null ? undefined : nextReadNote(notes, readAnchor.current)
    if (next) replace(stage, { subject: next.id, anchors: next.anchors, current: next.anchors.at(-1) ?? "" })
    else close(stage)
  }, [gone, notes, replace, close, stage])
  if (!open || (open.subject !== NEW_NOTE && !note)) return null
  return (
    <div className={styles.panel}>
      {!(note && isGrouped(note, notes)) && <Badges stage={stage} open={open} />}
      <Lost stage={stage} anchors={open.anchors} />
      {note ? (
        <NoteEditors stage={stage} note={note} notes={notes} open={open} />
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

// subject の伝言と、既読なら同じ物にチェックを出すほかの既読の伝言（新しい順）を、線で区切って並べる
function NoteEditors({
  stage,
  note,
  notes,
  open,
}: {
  stage: string
  note: Annotation
  notes: readonly Annotation[]
  open: RightSidePanelOpen
}) {
  const anchor = note.anchors.at(-1)
  const group = useMemo(
    () =>
      (note.props as NoteProps).readAt !== undefined && anchor !== undefined
        ? (readNotesByAnchor(notes).get(anchor) ?? [note])
        : [note],
    [note, notes, anchor],
  )
  // 開いた伝言が並びの途中なら、開いた伝言ごとに 1 回だけ、そこまでスクロールする（送信トレイから古い伝言を開いたときなど。
  // ほかの伝言が変わって並びが描き直されても、読んでいる所から引き戻さない）
  const subject = useRef<HTMLDivElement>(null)
  const scrolled = useRef<string | null>(null)
  const scrollTo = useScrollRightSidePanelTo()
  useEffect(() => {
    const el = subject.current
    if (!el || scrolled.current === note.id) return
    scrolled.current = note.id
    if (group[0]?.id !== note.id) scrollTo(el)
  }, [note.id, group, scrollTo])
  return (
    <>
      {group.map(n =>
        // 文が外で変わったら、テキストFormを新しい文で始め直す
        n.id === note.id ? (
          <div ref={subject} key={`${n.id}:${(n.props as NoteProps).text}`} className={styles.note} data-note={n.id}>
            {group.length > 1 && <Badges stage={stage} open={open} />}
            <NoteEditor
              stage={stage}
              id={n.id}
              anchors={n.anchors}
              props={n.props as NoteProps}
              next={ordered(open)}
              book={open.book}
            />
          </div>
        ) : (
          <div key={`${n.id}:${(n.props as NoteProps).text}`} className={styles.note} data-note={n.id}>
            <OtherBadges stage={stage} anchors={n.anchors} />
            <NoteEditor
              stage={stage}
              id={n.id}
              anchors={n.anchors}
              props={n.props as NoteProps}
              next={n.anchors}
              book={open.book}
            />
          </div>
        ),
      )}
    </>
  )
}

// 付ける先の名前のバッジ: カレントは色違い。押すとその物をカレントにする。名前は BADGE_CHARS 字で切り、全体はツールチップで見せる
function Badges({ stage, open }: { stage: string; open: RightSidePanelOpen }) {
  const t = useMessages(kit)
  const setCurrent = useSetRightSidePanelCurrent()
  return (
    // biome-ignore lint/a11y/useSemanticElements: バッジを束ねる並びで、入力Formのまとまり（fieldset）ではない
    <div className={styles.badges} role="group" aria-label={t("Things the note is on")}>
      {open.anchors.map(id => (
        <Badge key={id} stage={stage} id={id} current={id === open.current} onClick={() => setCurrent(stage, id)} />
      ))}
    </div>
  )
}

// subject でない伝言の付けた先のバッジ: 押すとその物を倍率そのままで真ん中に見せる（付ける先もカレントも変えない）
function OtherBadges({ stage, anchors }: { stage: string; anchors: readonly string[] }) {
  const t = useMessages(kit)
  const reveal = useRequestReveal()
  return (
    // biome-ignore lint/a11y/useSemanticElements: バッジを束ねる並びで、入力Formのまとまり（fieldset）ではない
    <div className={styles.badges} role="group" aria-label={t("Things the note is on")}>
      {anchors.map(id => (
        <Badge key={id} stage={stage} id={id} current={false} onClick={() => reveal(stage, [id])} />
      ))}
    </div>
  )
}

function Badge({ stage, id, current, onClick }: { stage: string; id: string; current: boolean; onClick: () => void }) {
  const name = useAnchorName(stage, id)
  return (
    <button type="button" className={styles.badge} aria-pressed={current} title={name} onClick={onClick}>
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

// 付けた伝言: 文を直すか付ける先を変えて「再送」。たたむ・消すは、押したときに変える。next は再送する付ける先の並び（subject の伝言なら右サイドパネルの付ける先、
// ほかの伝言なら自分の付ける先のまま）、book は編集ロックを掛けるブック
function NoteEditor({
  stage,
  id,
  anchors,
  props,
  next,
  book,
}: {
  stage: string
  id: string
  anchors: readonly string[]
  props: NoteProps
  next: readonly string[]
  book: string
}) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The note was refused")
  const close = useCloseRightSidePanel()
  const updatable = useAllowed(stage, NOTE_UPDATE.id).ok
  const removable = useAllowed(stage, NOTE_REMOVE.id).ok
  const [text, setText] = useState(props.text)
  const moved = next.length !== anchors.length || next.some((a, i) => anchors[i] !== a)
  // 文か付ける先を一度変えたら、閉じるまで、この伝言を AI が変えも消しもしない（読んだと知らせるのも。付いた物を消して伝言が変わるのも）
  const [edited, setEdited] = useState(false)
  const editing = text !== props.text || moved
  useEffect(() => {
    if (editing) setEdited(true)
  }, [editing])
  useEditLock(book, edited || editing ? [id] : [])
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

// 伝言 note が、同じ物にチェックを出すほかの既読の伝言とまとめて並ぶか（並ぶなら、バッジは伝言ごとに出す）
const isGrouped = (note: Annotation, notes: readonly Annotation[]): boolean => {
  const anchor = note.anchors.at(-1)
  return (
    (note.props as NoteProps).readAt !== undefined &&
    anchor !== undefined &&
    (readNotesByAnchor(notes).get(anchor)?.length ?? 0) > 1
  )
}
