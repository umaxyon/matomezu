// チケットスクリーンが見せる物を、レコードから整える純粋な関数: 履歴の行（起票の行を足し、新しい順に）・日ごとのまとめ。
// 日の区切りは時間帯で変わるので、時間帯を受け取る（無ければ使っている環境の時間帯）
import type { z } from "zod"
import type { By } from "../by"
import type { TICKET } from "../ticket"
import { type HISTORY, newestFirst, TOPIC_BODY } from "../ticket-history"

type Ticket = z.output<typeof TICKET.record>
type Line = z.output<typeof HISTORY.record>

export const FILED = "filed" // 起票の行の題（列挙の値でなく、画面が足す行）
export const BODY_UPDATED = TOPIC_BODY.id // 本文更新の行の題（文を持たない行。文は画面が題から決める）

// 題 topic の色の役割（起票の行は success。列挙の値の data の color）。列挙から無くなった題は undefined（色を付けない）
export const topicColor = (topic: string, data: { color: string } | undefined): string | undefined =>
  topic === FILED ? "success" : data?.color

// 列挙から無くなった題の名前: 題の id の終わり
export const topicTail = (topic: string): string => topic.split(":").pop() ?? topic

// チケット履歴の行の文の出どころ: 起票の行（filed）・本文更新の行（body）・文を持たない題の文の無い行（topic。題の名前を文にする）・行の文（text）
export type RowTextSource = "filed" | "body" | "topic" | "text"
export function rowTextSource(row: HistoryRow, textless: boolean): RowTextSource {
  if (row.topic === FILED) return "filed"
  if (row.topic === BODY_UPDATED) return "body"
  return textless && row.text === "" ? "topic" : "text"
}

export interface HistoryRow {
  id: string
  topic: string // 列挙 history-topic の値の id か FILED
  text: string
  at: string
  by: By
}

// チケット履歴の行（ticket のもの）に、起票の行を足し、新しい順（同じ時点は id の降順）に並べる
export function historyRows(ticket: Ticket, lines: readonly Line[]): HistoryRow[] {
  const own = lines.filter(l => l.ticket === ticket.id)
  const filed: HistoryRow = {
    id: `${FILED}:${ticket.id}`,
    topic: FILED,
    text: "",
    at: ticket.createdAt,
    by: ticket.createdBy,
  }
  return newestFirst([...own, filed])
}

const parts = (at: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, ...options }).format(new Date(at))

// 日の区切り（YYYY-MM-DD）と時刻（HH:MM）
export const dayKey = (at: string, timeZone?: string): string =>
  parts(at, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" })
export const timeOf = (at: string, timeZone?: string): string =>
  parts(at, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

// 見せる日時（YYYY/MM/DD HH:MM）
export const whenOf = (at: string, timeZone?: string): string =>
  `${dayKey(at, timeZone).replaceAll("-", "/")} ${timeOf(at, timeZone)}`

// 日の見出し（11/12（木）など。言語 lang で整える）
export const dayHeading = (key: string, lang: string): string => {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number)
  return new Intl.DateTimeFormat(lang, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

// 新しい順の行を、日ごとにまとめる（並びはそのまま）
export function groupByDay(rows: readonly HistoryRow[], timeZone?: string): { day: string; items: HistoryRow[] }[] {
  const days: { day: string; items: HistoryRow[] }[] = []
  for (const row of rows) {
    const day = dayKey(row.at, timeZone)
    const last = days[days.length - 1]
    if (last?.day === day) last.items.push(row)
    else days.push({ day, items: [row] })
  }
  return days
}
