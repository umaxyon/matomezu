// ソースのペインの中身: ページの原文を書くテキストForm。書くたびに、変わった所を page-update の find・replace（source-edit.ts）で送る。
// 続けて書いた物は 1 つの画面の履歴の段にまとめる（間が GROUP_PAUSE_MS 空く・書く所を動かす・テキストFormから出る・送れない・ほかから原文が変わると、次は別の画面の履歴の段）。
// ほかから原文が変わったら（AI・元に戻す・送れなかったなど）、書いている物をページの原文にし、書く所をずらして保つ。日本語の変換中は送らず、変換が終わってから送る・合わせる。
// 行えなければ（ロック中など）書けない。Tab キーは利用者の設定の項目（tab-key.ts）の字を書く。元に戻す・やり直すのキーは、このテキストFormが名乗るキーの範囲で base のコマンドに渡し、テキストForm自身の元に戻すは使わない。
// テキストFormは、同じ原文を同じ字の並びで写した物（ブロックごとに切った、見えない写し）に重ね、写しの高さで伸ばす（ペインがスクロールする。ブロックの上端は写しで測る）
import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useActions, useAllowed, usePerform, useUserSetting } from "../../../../plugin-api/ui"
import type { MarkdownDocument } from "../../../base"
import { SOURCE_KEYS_SCOPE } from "../markdown"
import { sourcePieces } from "../scroll-sync"
import { followCaret, sourceEdit } from "../source-edit"
import { TAB_KEY, tabKeyText } from "../tab-key"
import styles from "./MarkdownView.module.css"

// 続けて書いた物を 1 つの画面の履歴の段にまとめる、書く間の長さの上限（ミリ秒）
const GROUP_PAUSE_MS = 1000

type Props = {
  stage: string
  book: string
  page: string
  text: string // ページの原文
  document: MarkdownDocument // ページの原文を読んだ物（書いている物より古いことがある。ブロックの始まりの位置だけを使う）
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}

export function SourcePane({ stage, book, page, text, document, scrollRef, onScroll }: Props) {
  const perform = usePerform(stage)
  const { continueStep } = useActions()
  const allowed = useAllowed(stage, "@matomezu/base:page-update", { page })
  const tab = tabKeyText(useUserSetting(TAB_KEY.id))
  const [draft, setDraft] = useState(text)
  const field = useRef<HTMLTextAreaElement>(null)
  const base = useRef(text) // 書いている物の元にした、ページの原文
  const latest = useRef(text) // いちばん新しいページの原文
  latest.current = text
  const composing = useRef(false)
  // 続けている画面の履歴の段: 最後に送った時と、そのときの書く所
  const group = useRef<{ at: number; caret: number } | null>(null)
  const caret = useRef<number | null>(null) // 次に描いたあとに置く書く所

  // ほかから変わったページの原文に合わせる（書いている物に、送っていない所は無い）
  const follow = () => {
    const now = latest.current
    if (now === base.current) return
    const el = field.current
    group.current = null
    caret.current = el ? followCaret(base.current, now, el.selectionStart) : null
    base.current = now
    setDraft(now)
  }
  useLayoutEffect(() => {
    if (!composing.current) follow()
  })
  useLayoutEffect(() => {
    const el = field.current
    if (el && caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })

  // 書いた物 next を送る
  const send = (next: string) => {
    const el = field.current
    const edit = sourceEdit(base.current, next, latest.current)
    if (edit.kind === "same") return
    const at = Date.now()
    const g = group.current
    if (edit.kind === "send" && g && at - g.at < GROUP_PAUSE_MS) continueStep(book)
    const was = base.current
    base.current = next
    const done = edit.kind === "send" ? perform("@matomezu/base:page-update", { page, fields: edit.fields }) : null
    if (!done?.ok) {
      // 送れなければ、ページの原文に戻す（書いた字は残らない）
      base.current = was
      group.current = null
      caret.current = el ? followCaret(next, was, el.selectionStart) : null
      setDraft(was)
      return
    }
    group.current = { at, caret: el?.selectionStart ?? 0 }
  }

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value)
    if (!composing.current) send(e.target.value)
  }
  // 書く所を動かしたら、次は別の画面の履歴の段
  const onSelect = () => {
    const el = field.current
    const g = group.current
    if (g && el && (el.selectionStart !== g.caret || el.selectionEnd !== g.caret)) group.current = null
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return
    const el = e.currentTarget
    if (el.readOnly) return
    e.preventDefault()
    el.setRangeText(tab, el.selectionStart, el.selectionEnd, "end")
    setDraft(el.value)
    send(el.value)
  }
  // テキストForm自身の元に戻す・やり直す（ブラウザのメニューなど）は使わない
  useEffect(() => {
    const el = field.current
    const stop = (e: InputEvent) => {
      if (e.inputType === "historyUndo" || e.inputType === "historyRedo") e.preventDefault()
    }
    el?.addEventListener("beforeinput", stop)
    return () => el?.removeEventListener("beforeinput", stop)
  }, [])

  const pieces = useMemo(
    () =>
      sourcePieces(
        draft,
        document.blocks.map(b => b.range.start),
      ),
    [draft, document],
  )
  return (
    <div ref={scrollRef} className={styles.scroll} onScroll={onScroll}>
      <div className={styles.sourceBox}>
        <pre className={`${styles.source} ${styles.sourceCopy}`} aria-hidden>
          {pieces.map(p => (
            <span key={p.start} data-markdown-block={p.start}>
              {p.text}
            </span>
          ))}
          {/* 最後の改行の後ろの行も、テキストFormと同じ高さにする（幅の無い字） */}
          {"\u200b"}
        </pre>
        <textarea
          ref={field}
          className={`${styles.source} ${styles.sourceField}`}
          value={draft}
          readOnly={!allowed.ok}
          spellCheck={false}
          data-key-scope={SOURCE_KEYS_SCOPE}
          onChange={onChange}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          onBlur={() => {
            group.current = null
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={e => {
            composing.current = false
            send(e.currentTarget.value)
            follow()
          }}
        />
      </div>
    </div>
  )
}
