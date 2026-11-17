// チケットのチケットカード（レーンの中の 1 枚）: 番号（プレフィクス＋番号）・名前・タグのバッヂ・優先度の印（プロジェクトの cardShows が出すときだけ）・右上に担当の鳥。
// 大きさ（チケットサイズ）で形が変わる: large は名前とタグを折り返し（タグは 3 行まで）、medium は名前を 1 行で … で切りタグも 1 行、small は番号と名前の 1 行だけ（… で切る）。
// タグはプロジェクトの順で、入らない分は「+N」
// 押すとチケットスクリーンを開く（上下に分けて見せていれば閉じる。開き方は useOpenTicket の card）。上下に分けて見せているチケットのカードは色を付ける（data-open）。
// チケットカードには data-card（チケットの id）を付ける
import { useMessages, usePluginState } from "../../../plugin-api/ui"
import { kit } from "../kit"
import type { CardShows, CardSize } from "../project"
import { ticketLabel } from "../ticket/label"
import { useOpenTicket } from "../ticket-screen/useOpenTicket"
import { CARD_VISIT } from "."
import { AssigneeStack } from "./AssigneeStack"
import { CardTags } from "./CardTags"
import styles from "./LaneView.module.css"
import { PRIORITIES, type TagRecord, type TicketRecord, type WorkroomRecord } from "./shown"

// 優先度の棒の形（SVG の単位）: どの棒も同じ太さで描けるよう、CSS の px ではなく SVG で描く
const BAR_WIDTH = 2
const BAR_PITCH = 3.2
const BAR_TOP = 10
const barHeight = (i: number) => 3 + i * 1.75

export function TicketCardView({
  size,
  shows,
  ticket,
  prefix,
  tags,
  assignees,
}: {
  size: CardSize
  shows: CardShows
  ticket: TicketRecord
  prefix: string
  tags: readonly TagRecord[]
  assignees: readonly WorkroomRecord[]
}) {
  const opener = useOpenTicket()
  const visit = usePluginState(kit, CARD_VISIT)
  const lit = visit?.phase === "visiting" && visit.ticket === ticket.id
  const show = () => opener.card(ticket.id)
  return (
    // biome-ignore lint/a11y/useSemanticElements: 中に担当の鳥など押せる物を持つので、button にはできない
    <div
      className={styles.card}
      data-card={ticket.id}
      data-size={size}
      data-lit={lit}
      data-open={opener.shown(ticket.id)}
      aria-pressed={opener.shown(ticket.id)}
      role="button"
      tabIndex={0}
      onClick={show}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          show()
        }
      }}
    >
      {size === "small" ? (
        <span className={styles.cardLine}>
          <span className={styles.cardId}>{ticketLabel(prefix, ticket.number)}</span> {ticket.name}
        </span>
      ) : (
        <>
          {assignees.length > 0 ? (
            <span className={styles.assignee}>
              <AssigneeStack rooms={assignees} />
            </span>
          ) : null}
          <span className={styles.cardId}>{ticketLabel(prefix, ticket.number)}</span>
          <span className={styles.cardName}>{ticket.name}</span>
          <span className={styles.foot}>
            <CardTags tags={tags} lines={size === "large" ? 3 : 1} />
            {shows.priority ? <PriorityMark priority={ticket.priority} /> : null}
          </span>
        </>
      )}
    </div>
  )
}

// 優先度の印: 段の名前と、段の数だけ色が付く 5 本の棒（名前の長さで棒の位置がずれないよう、棒を右端に置く。棒の下と字の下をそろえ、行ではタグのバッヂの下ともそろえる）
function PriorityMark({ priority }: { priority: (typeof PRIORITIES)[number] }) {
  const t = useMessages(kit)
  const level = PRIORITIES.indexOf(priority)
  const name = t(`priority ${priority}`)
  return (
    <span className={styles.priority} title={t("Priority {name}", { name })}>
      <span className={styles.priorityName}>{name}</span>
      <svg className={styles.bars} viewBox={`0 0 ${BAR_PITCH * PRIORITIES.length} ${BAR_TOP}`} aria-hidden="true">
        {PRIORITIES.map((p, i) => (
          <rect
            key={p}
            x={i * BAR_PITCH}
            y={BAR_TOP - barHeight(i)}
            width={BAR_WIDTH}
            height={barHeight(i)}
            rx={0.5}
            data-on={i <= level}
          />
        ))}
      </svg>
    </span>
  )
}
