// チケットカードのタグの並び: プロジェクトの順に、決めた行数（lines）に入るだけバッヂを並べ、入らない分は「+N」（ポインタを乗せると残りの名前）。
// 入るかは描いてから測る: 全部を並べ、「+N」まで含めて行数を超えるあいだ 1 つずつ減らす。並びの幅が変わったら全部から測り直す
import { useLayoutEffect, useRef, useState } from "react"
import type { TagRecord } from "./shown"
import { TagBadge } from "./TagBadge"
import styles from "./TagBadge.module.css"

export function CardTags({ tags, lines }: { tags: readonly TagRecord[]; lines: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)
  const [shown, setShown] = useState(tags.length)
  const key = tags.map(t => t.id).join(" ")

  // 並びの幅を見張る（幅は外の枠で決まり、中のバッヂの数では変わらない）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const watch = new ResizeObserver(() => setWidth(w => (w === el.clientWidth ? w : el.clientWidth)))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // タグか行数か幅が変わったら、全部を並べて測り直す
  // biome-ignore lint/correctness/useExhaustiveDependencies: key・width は測り直す合図
  useLayoutEffect(() => setShown(tags.length), [key, lines, width, tags.length])
  // 行数を超えていれば 1 つ減らす（描くたびに確かめ、収まるか 0 になったら止まる）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shown === 0) return
    const items = [...el.children] as HTMLElement[]
    const rows = [...new Set(items.map(i => i.offsetTop))].length
    if (rows > lines) setShown(shown - 1)
  })

  const rest = tags.slice(shown)
  return (
    <span ref={ref} className={styles.fit}>
      {tags.slice(0, shown).map(tag => (
        <TagBadge key={tag.id} tag={tag} />
      ))}
      {rest.length > 0 ? (
        <span className={styles.more} data-more title={rest.map(t => t.name).join(", ")}>
          +{rest.length}
        </span>
      ) : null}
    </span>
  )
}
