// 文中のチケットの番号をリンクにした文字（履歴の行・質問の文。マークダウンの描画を通らない文字用）: 見つける関数 find が見つけた所をリンクにして割る（base の splitWords）。押すと open にチケットの id と押したリンクの要素を渡す
import { useMemo } from "react"
import { splitWords, type WordFinder } from "../../base"
import styles from "./LinkedText.module.css"

export function LinkedText({
  text,
  find,
  open,
}: {
  text: string
  find: WordFinder
  open: (ticket: string, from: Element) => void
}) {
  const pieces = useMemo(() => splitWords(text, find(text)), [text, find])
  return pieces.map(p =>
    p.kind === "text" ? (
      p.text
    ) : (
      <button key={p.at} type="button" className={styles.ref} onClick={e => open(p.target, e.currentTarget)}>
        {p.text}
      </button>
    ),
  )
}
