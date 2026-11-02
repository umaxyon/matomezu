// コメントの中身（吹き出しと右サイドパネルで使う）: 書き込みの並びと、返事が欲しいコメントには返事のテキストForm。たたむ（たたんでいれば吹き出しを出す）・消す。
// 吹き出しの中では、書き込みの並びを押す（キーでは Enter か Space）と onOpen を呼ぶ。文のテキストForm（GrowingText）は下書きの吹き出しも使う
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { COMMENT_REMOVE, COMMENT_REPLY, COMMENT_UPDATE, type CommentProps } from "."
import styles from "./CommentLayer.module.css"

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
      {onOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: 書き込みの並びを包む箱で、中の文は選べるままにする（ボタンにすると文を選べない）
        <div
          className={`${styles.posts} ${styles.opens}`}
          role="button"
          tabIndex={0}
          aria-label={t("Open comment")}
          onClick={onOpen}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onOpen()
            }
          }}
        >
          <Posts props={props} />
        </div>
      ) : (
        <div className={styles.posts}>
          <Posts props={props} />
        </div>
      )}
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

// 書き込みの並び（文の無い書き込みは出さない）
function Posts({ props }: { props: CommentProps }) {
  const t = useMessages(kit)
  return props.posts
    .filter(p => p.text !== "")
    .map(p => (
      <p key={p.at + p.text} className={styles.post}>
        <span className={styles.by}>{t(p.by === "ai" ? "AI" : "You")}</span>
        {p.text}
      </p>
    ))
}

// 文のテキストForm: 幅は吹き出しの幅で折り返し、書いた分だけ下へ伸びる。Ctrl（Mac は Cmd）+Enter で送り、Esc で onEscape を呼ぶ
export function GrowingText({
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
