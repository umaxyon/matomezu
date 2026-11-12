// チケット履歴の題のバッヂ: 題の名前を、題の色の役割の字と、その色を薄く敷いた地で見せる。起票の行は FILED（画面が足した行で、色は success）。
// 題が列挙 history-topic に無くなっていれば、色を付けず、題の id の終わりを名前にする
import { enumValuesOf } from "../../plugin-api"
import { useCoreCatalog, useMessages, useT } from "../../plugin-api/ui"
import { HISTORY_TOPIC } from "./history"
import { kit } from "./kit"
import styles from "./TopicBadge.module.css"
import { FILED } from "./ticket-view"

export type TopicData = { color: string; asksUser?: boolean }

// 題 topic の列挙の値の data（無ければ undefined）
export function useTopicData(topic: string): TopicData | undefined {
  const catalog = useCoreCatalog()
  return enumValuesOf(catalog, HISTORY_TOPIC.id).find(v => v.id === topic)?.data as TopicData | undefined
}

export function TopicBadge({ topic }: { topic: string }) {
  const t = useT()
  const own = useMessages(kit)
  const catalog = useCoreCatalog()
  const value = enumValuesOf(catalog, HISTORY_TOPIC.id).find(v => v.id === topic)
  const color = topic === FILED ? "success" : (value?.data as TopicData | undefined)?.color
  const name = topic === FILED ? own("Filed") : value ? t(value.title) : (topic.split(":").pop() ?? topic)
  return (
    <span className={styles.topic} style={color ? { color: `var(--skin-palette-${color})` } : undefined}>
      {name}
    </span>
  )
}
