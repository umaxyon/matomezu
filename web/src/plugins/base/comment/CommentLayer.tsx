// コメントのレイヤー（ウィジェット comment-layer）: 開いているブックのコメントを、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出すコメントは物の右に吹き出しを（幅は決まった幅で、上の辺をそろえて下へ伸びる）、たたんだコメントは物の右上の角にコメントの絵を、
// 指すだけのマーク（文の無いコメントのうち、指すだけのもの）は物の上の辺を歩く絵を出す。どちらの絵も、押すと吹き出しを開く。
// コメントの下書き（draft.tsx）があれば、その吹き出しも出す。吹き出しの色はスキンの bubble だけで、物やコメントの様子では変えない
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Annotation } from "../../../core/annotation"
import { useMessages } from "../../../ui/i18n"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog, usePerform } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { Stand } from "../utils/anchors"
import { refusalMessage } from "../utils/refusal"
import type { StageSlotProps } from "../workspace/ui"
import { COMMENT, COMMENT_ADD, COMMENT_REMOVE, COMMENT_REPLY, COMMENT_UPDATE, type CommentProps } from "."
import styles from "./CommentLayer.module.css"
import { type CommentDraft, useCommentDraft, useSetCommentDraft } from "./draft"
import { MarkWalker } from "./MarkWalker"

const NONE: readonly Annotation[] = []

export function CommentLayer({ stage }: StageSlotProps) {
  const comments = useMatomezuState(s => {
    const book = s.workspace.stages.find(st => st.id === stage)?.opened?.book
    return (book && s.annotations[book]) || NONE
  })
  const draft = useCommentDraft(stage)
  return (
    <>
      {comments
        .filter(c => c.annotation === COMMENT.id)
        .map(c => (
          <CommentStand
            key={c.id}
            stage={stage}
            id={c.id}
            anchor={c.anchors.at(-1) ?? ""}
            props={c.props as CommentProps}
          />
        ))}
      {draft && <DraftStand key={draft.anchors.join(" ")} stage={stage} draft={draft} />}
    </>
  )
}

function CommentStand({
  stage,
  id,
  anchor,
  props,
}: {
  stage: string
  id: string
  anchor: string
  props: CommentProps
}) {
  const t = useMessages(kit)
  const run = useRun(stage)
  const open = () => run(COMMENT_UPDATE.id, { comment: id, bubble: true })
  if (props.bubble)
    return (
      <Stand anchor={anchor} side="right" label={t("Comment")}>
        <Bubble stage={stage} id={id} props={props} />
      </Stand>
    )
  if (props.ask === "point" && props.posts.every(p => p.text === ""))
    return (
      <Stand anchor={anchor} side="edge" span label={t("Comment")}>
        <MarkWalker label={t("Open comment")} onOpen={open} />
      </Stand>
    )
  return (
    <Stand anchor={anchor} side="corner" label={t("Comment")}>
      <button type="button" className={styles.folded} aria-label={t("Open comment")} onClick={open}>
        <CommentIcon />
      </button>
    </Stand>
  )
}

// 吹き出し: 書き込みの並びと、返事が欲しいコメントには返事のテキストForm。たたむ・消す
function Bubble({ stage, id, props }: { stage: string; id: string; props: CommentProps }) {
  const t = useMessages(kit)
  const run = useRun(stage)
  const [reply, setReply] = useState("")
  const send = () => {
    if (reply.trim() !== "" && run(COMMENT_REPLY.id, { comment: id, text: reply })) setReply("")
  }
  return (
    <div className={styles.bubble}>
      <div className={styles.posts}>
        {props.posts
          .filter(p => p.text !== "")
          .map(p => (
            <p key={p.at + p.text} className={styles.post}>
              <span className={styles.by}>{t(p.by === "ai" ? "AI" : "You")}</span>
              {p.text}
            </p>
          ))}
      </div>
      {props.ask === "reply" && (
        <GrowingText value={reply} onChange={setReply} placeholder={t("Reply…")} onSubmit={send} label={t("Reply")} />
      )}
      <div className={styles.buttons}>
        {props.ask === "reply" && (
          <button type="button" className={styles.primary} disabled={reply.trim() === ""} onClick={send}>
            {t("Reply")}
          </button>
        )}
        <button
          type="button"
          className={styles.button}
          onClick={() => run(COMMENT_UPDATE.id, { comment: id, bubble: false })}
        >
          {t("Fold")}
        </button>
        <button type="button" className={styles.danger} onClick={() => run(COMMENT_REMOVE.id, { comment: id })}>
          {t("Remove")}
        </button>
      </div>
    </div>
  )
}

// コメントの下書きの吹き出し: 文と、返事が欲しいか指すだけかを選び、付ける。Esc かキャンセルで、付けずに閉じる
function DraftStand({ stage, draft }: { stage: string; draft: CommentDraft }) {
  const t = useMessages(kit)
  const run = useRun(stage)
  const [text, setText] = useState("")
  const [ask, setAsk] = useState<CommentProps["ask"]>("reply")
  const setDraft = useSetCommentDraft()
  const end = () => setDraft(stage, null)
  const add = () => {
    // 指すだけのマークは、吹き出しを出さず、上の辺を歩く絵だけにする
    const bubble = !(ask === "point" && text === "")
    if (run(COMMENT_ADD.id, { anchors: [...draft.anchors], text, ask, bubble })) end()
  }
  return (
    <Stand anchor={draft.anchors.at(-1) ?? ""} side="right" label={t("Add comment")}>
      <div className={styles.bubble}>
        <GrowingText
          value={text}
          onChange={setText}
          placeholder={t("Comment…")}
          onSubmit={add}
          onEscape={end}
          label={t("Comment")}
          autoFocus
        />
        <fieldset className={styles.asks} aria-label={t("Asks for")}>
          {(["reply", "point"] as const).map(a => (
            <label key={a} className={ask === a ? styles.askOn : styles.ask}>
              <input
                type="radio"
                className={styles.radio}
                name={`${stage}-ask`}
                checked={ask === a}
                onChange={() => setAsk(a)}
              />
              {t(a === "reply" ? "Wants a reply" : "Only pointing")}
            </label>
          ))}
        </fieldset>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={add}>
            {t("Add")}
          </button>
          <button type="button" className={styles.button} onClick={end}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </Stand>
  )
}

// 文のテキストForm: 幅は吹き出しの幅で折り返し、書いた分だけ下へ伸びる。Ctrl（Mac は Cmd）+Enter で送り、Esc で onEscape を呼ぶ
function GrowingText({
  value,
  onChange,
  onSubmit,
  onEscape,
  placeholder,
  label,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onEscape?: () => void
  placeholder: string
  label: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 文が変わるたびに高さを測り直す
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  // 右クリックのメニューで「コメント」を選んだら、すぐ書ける（スタンドは測り終えるまで隠れているので、見えてから焦点を入れる）
  useEffect(() => {
    if (!autoFocus) return
    let frame = 0
    const tryFocus = () => {
      const el = ref.current
      if (!el) return
      el.focus()
      if (document.activeElement !== el) frame = requestAnimationFrame(tryFocus)
    }
    tryFocus()
    return () => cancelAnimationFrame(frame)
  }, [autoFocus])
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === "Escape") onEscape?.()
  }
  return (
    <textarea
      ref={ref}
      className={styles.text}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

// コメントのアクションを、そのステージのブックに行う。断られたらトーストで知らせ、false を返す
function useRun(stage: string) {
  const perform = usePerform(stage) as (action: string, args: unknown) => { ok: boolean }
  const catalog = useCoreCatalog()
  const { showToast } = useActions()
  return (action: string, args: unknown): boolean => {
    const done = perform(action, args)
    if (!done.ok)
      showToast({
        kind: "warn",
        message: refusalMessage(catalog, done as never, kit.message("The comment was refused")),
      })
    return done.ok
  }
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
