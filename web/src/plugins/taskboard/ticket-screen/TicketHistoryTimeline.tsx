// チケット履歴の一覧: 新しい順に、日ごとにまとめる。1 行は時刻・題のバッヂ・起きた事（長ければ … で切り、乗せると全文）・書いた者の鳥。
// 利用者への質問の題（列挙の値の data.asksUser）だけは、右端の鳥から出る吹き出しにして押せる（押すと onOpenQuestion。開いている質問の吹き出しは色を当てる）。左の縦の線と点で時間の流れを見せる
import { useMessages, useSettings } from "../../../plugin-api/ui"
import { kit } from "../kit"
import styles from "./TicketHistoryTimeline.module.css"
import { TopicBadge, useTopicData, useTopicName } from "./TopicBadge"
import { dayHeading, groupByDay, type HistoryRow, namesLine, rowTextSource, timeOf } from "./view"
import { WriterBird } from "./WriterBird"

export function TicketHistoryTimeline({
  rows,
  openQuestion,
  onOpenQuestion,
  workroomNames,
}: {
  rows: readonly HistoryRow[]
  workroomNames: Readonly<Record<string, string>> // ワークルームの id → 名前（完了の行の、外した担当を名前で見せる）
  openQuestion: string | undefined // 右に開いている質問の行の id
  onOpenQuestion: (row: HistoryRow) => void
}) {
  const { lang } = useSettings()
  return (
    <ol className={styles.timeline}>
      {groupByDay(rows).map(d => (
        <li key={d.day} className={styles.day}>
          <div className={styles.date}>{dayHeading(d.day, lang)}</div>
          <ol className={styles.items}>
            {d.items.map(row => (
              <Row
                key={row.id}
                row={row}
                open={openQuestion === row.id}
                onOpenQuestion={onOpenQuestion}
                workroomNames={workroomNames}
              />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function Row({
  row,
  open,
  onOpenQuestion,
  workroomNames,
}: {
  row: HistoryRow
  open: boolean
  onOpenQuestion: (row: HistoryRow) => void
  workroomNames: Readonly<Record<string, string>>
}) {
  const t = useMessages(kit)
  const { lang } = useSettings()
  const data = useTopicData(row.topic)
  const topicName = useTopicName(row.topic)
  const source = rowTextSource(row, data?.textless === true)
  const releasedNames = (row.released ?? []).flatMap(id => workroomNames[id] ?? [])
  const text =
    source === "filed"
      ? t("Filed this ticket")
      : source === "body"
        ? t("Updated the body")
        : source === "topic"
          ? releasedNames.length > 0
            ? t("{topic}: {names}", { topic: topicName, names: namesLine(releasedNames, lang) })
            : topicName
          : row.text
  return (
    <li className={styles.item}>
      <span className={styles.time}>{timeOf(row.at)}</span>
      <TopicBadge topic={row.topic} />
      {data?.asksUser ? (
        <button
          type="button"
          className={styles.bubble}
          title={text}
          aria-pressed={open}
          onClick={() => onOpenQuestion(row)}
        >
          <span className={styles.bubbleText}>{text}</span>
        </button>
      ) : (
        <span className={styles.clip} title={text}>
          {text}
        </span>
      )}
      <WriterBird by={row.by} />
    </li>
  )
}
