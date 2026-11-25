// チケット履歴の一覧: 新しい順に、日ごとにまとめる。1 行は時刻・題のバッヂ・起きた事・書いた者の鳥。
// 起きた事は 1 行で … で切り、切れている行だけ文末に「開く」を出す（押すと折り返して全文にし、文末の「閉じる」で 1 行に戻す。開け閉めは見ている間だけ覚える）。
// 利用者への質問の題（列挙の値の data.asksUser）だけは、右端の鳥から出る吹き出しにして押せる（押すと onOpenQuestion で右に全文が開く。開いている質問の吹き出しは色を当てる）。左の縦の線と点で時間の流れを見せる
import { useRef, useState } from "react"
import { useMessages, useSettings } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { LinkedText } from "./LinkedText"
import styles from "./TicketHistoryTimeline.module.css"
import { TopicBadge, useTopicData, useTopicName } from "./TopicBadge"
import { useClipped } from "./useClipped"
import { useTicketRefs } from "./useTicketRefs"
import { dayHeading, groupByDay, type HistoryRow, namesLine, rowTextSource, timeOf } from "./view"
import { WriterBird } from "./WriterBird"

export function TicketHistoryTimeline({
  ticket,
  rows,
  openQuestion,
  onOpenQuestion,
  workroomNames,
}: {
  ticket: string // 開いているチケットの id（文中の自分の番号は、押しても何もしない）
  rows: readonly HistoryRow[]
  workroomNames: Readonly<Record<string, string>> // ワークルームの id → 名前（完了の行の、外した担当を名前で見せる）
  openQuestion: string | undefined // 右に開いている質問の行の id
  onOpenQuestion: (row: HistoryRow) => void
}) {
  const { lang } = useSettings()
  const refs = useTicketRefs(ticket)
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
                refs={refs}
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
  refs,
}: {
  row: HistoryRow
  open: boolean
  onOpenQuestion: (row: HistoryRow) => void
  workroomNames: Readonly<Record<string, string>>
  refs: ReturnType<typeof useTicketRefs>
}) {
  const t = useMessages(kit)
  const { lang } = useSettings()
  const [expanded, setExpanded] = useState(false)
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
    <li className={styles.item} data-expanded={expanded || undefined}>
      <span className={styles.time}>{timeOf(row.at)}</span>
      <TopicBadge topic={row.topic} />
      {data?.asksUser ? (
        <button type="button" className={styles.bubble} aria-pressed={open} onClick={() => onOpenQuestion(row)}>
          <span className={styles.bubbleText}>{text}</span>
        </button>
      ) : (
        <RowText
          text={text}
          expanded={expanded}
          onToggle={() => setExpanded(e => !e)}
          linked={source === "text" ? refs : undefined}
        />
      )}
      <WriterBird by={row.by} />
    </li>
  )
}

// 行の起きた事: 閉じている間は 1 行で … で切り、切れていれば右に「開く」。開いている間は折り返して全文にし、文末に「閉じる」。linked があれば文中のチケットの番号をリンクにする
function RowText({
  text,
  expanded,
  onToggle,
  linked,
}: {
  text: string
  expanded: boolean
  onToggle: () => void
  linked: ReturnType<typeof useTicketRefs> | undefined
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLSpanElement>(null)
  const clipped = useClipped(ref, text, expanded)
  const toggle = (expanded || clipped) && (
    <button type="button" className={styles.toggle} aria-expanded={expanded} onClick={onToggle}>
      {expanded ? t("Close the line") : t("Open the line")}
    </button>
  )
  return (
    <>
      <span ref={ref} className={expanded ? styles.full : styles.clip}>
        {linked ? <LinkedText text={text} find={linked.find} open={linked.open} /> : text}
        {expanded && toggle}
      </span>
      {!expanded && toggle}
    </>
  )
}
