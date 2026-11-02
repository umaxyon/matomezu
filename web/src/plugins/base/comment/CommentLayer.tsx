// コメントのレイヤー（ウィジェット comment-layer）: 開いているブックのコメントを、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出すコメントは物の右に吹き出しを（幅は決まった幅で、上の辺をそろえて下へ伸びる）、たたんだコメントは物の右上の角にコメントの絵を出す。
// 絵か吹き出しを押すと、右サイドパネルにそのコメントを出す（吹き出しを出すかのデータは変えない。右サイドパネルを閉じたのと同じ押しでは開かない）。
// コメントの下書き（commands.ts の COMMENT_DRAFT）があれば、その吹き出しも出す。吹き出しの色はスキンの bubble だけで、物やコメントの様子では変えない
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import { kit } from "../kit"
import { closedByThisPress, useOpenRightSidePanel } from "../right-side-panel/hooks"
import { Stand } from "../utils/anchors"
import type { StageSlotProps } from "../workspace/ui"
import { COMMENT, COMMENT_ADD, COMMENT_REMOVE, COMMENT_REPLY, COMMENT_UPDATE, type CommentProps } from "."
import styles from "./CommentLayer.module.css"
import { COMMENT_DRAFT } from "./commands"
import { COMMENT_THREAD_ID } from "./thread-id"

export function CommentLayer({ stage }: StageSlotProps) {
  const comments = useAnnotationsOf(stage, COMMENT.id)
  const draft = useAnchorTargets(stage, COMMENT_DRAFT)
  return (
    <>
      {comments.map(c => (
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
  const openPanel = useOpenRightSidePanel()
  const open = () => {
    if (!closedByThisPress()) openPanel(stage, { panel: COMMENT_THREAD_ID, subject: id, anchor })
  }
  if (props.bubble)
    return (
      <Stand anchor={anchor} side="right" label={t("Comment")}>
        <div className={styles.bubble}>
          <CommentThread stage={stage} id={id} props={props} onOpen={open} />
        </div>
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

// コメントの中身: 書き込みの並びと、返事が欲しいコメントには返事のテキストForm。たたむ（たたんでいれば吹き出しを出す）・消す。
// 吹き出しの中では、書き込みの並びを押すと onOpen を呼ぶ
export function CommentThread({
  stage,
  id,
  props,
  onOpen,
}: {
  stage: string
  id: string
  props: CommentProps
  onOpen?: () => void
}) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The comment was refused")
  const [reply, setReply] = useState("")
  const send = () => {
    if (reply.trim() !== "" && run(COMMENT_REPLY.id, { comment: id, text: reply })) setReply("")
  }
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 押すと右サイドパネルに出すだけ（キーでは、たたんだ絵のボタンから開く） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
      <div className={onOpen ? `${styles.posts} ${styles.opens}` : styles.posts} onClick={onOpen}>
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
          onClick={() => run(COMMENT_UPDATE.id, { comment: id, bubble: !props.bubble })}
        >
          {t(props.bubble ? "Fold" : "Show bubble")}
        </button>
        <button type="button" className={styles.danger} onClick={() => run(COMMENT_REMOVE.id, { comment: id })}>
          {t("Remove")}
        </button>
      </div>
    </>
  )
}

// コメントの下書きの吹き出し: 文と、返事が欲しいか指すだけかを選び、付ける。Esc かキャンセルで、付けずに閉じる
function DraftStand({ stage, draft }: { stage: string; draft: AnchorTargets }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The comment was refused")
  const [text, setText] = useState("")
  const [ask, setAsk] = useState<CommentProps["ask"]>("reply")
  const setDraft = useSetAnchorTargets(COMMENT_DRAFT)
  const end = () => setDraft(stage, null)
  const add = () => {
    if (text.trim() !== "" && run(COMMENT_ADD.id, { anchors: [...draft.anchors], text, ask })) end()
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
          <button type="button" className={styles.primary} disabled={text.trim() === ""} onClick={add}>
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

function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
