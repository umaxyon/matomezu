// タスクボードのレーン 1 列: タイトル帯（左端に並べ方のボタン。押すと一覧。右端に最大化のボタン）と、並べ方のとおりに並べたチケットカード。
// 最大化すると、このレーンだけでタスクボードの幅いっぱいに広がり、ほかのレーンは畳まれる。最大化・元に戻すで動いている間はチケットカードを隠し、動き終わってから、折り返す並びにして出す
// （動いている間に折り返すと、高さが変わるたびにチケットカードが別の列へ移り直して、ちらつくため）
import { useEffect, useRef, useState } from "react"
import { useMessages, usePluginState, useUpdatePluginState } from "../../../plugin-api/ui"
import { MaximizeIcon, RestoreIcon, SortIcon } from "../icons"
import { kit } from "../kit"
import { LANE_SETTLE_MS } from "../motion"
import type { useGripDrag } from "../reorder/useGripDrag"
import { assigneesOf } from "../ticket/assignees"
import { tagsOf } from "../ticket/tags"
import { LANE_SORTS } from "."
import styles from "./LaneView.module.css"
import { SortTray } from "./SortTray"
import { cardSizeOf, type LaneInfo, type ProjectRecord, type TicketRecord, type WorkroomRecord } from "./shown"
import { DEFAULT_SORT, type SortRules, sortActive, sortTickets } from "./sort"
import { TicketCardView } from "./TicketCardView"

// レーンの入れ替えのドラッグ: レーンの枠に rowProps と markClass、タイトル帯に gripProps（useGripDrag の物）
export interface LaneDrag {
  rowProps: ReturnType<ReturnType<typeof useGripDrag>["dragRowProps"]>
  gripProps: ReturnType<ReturnType<typeof useGripDrag>["gripProps"]>
  markClass: string
}

export function LaneView({
  project,
  lane,
  tickets,
  workrooms,
  maximized,
  folded,
  onToggleMaximize,
  drag,
}: {
  project: ProjectRecord
  lane: LaneInfo
  tickets: readonly TicketRecord[]
  workrooms: readonly WorkroomRecord[] // ワークルーム全部（担当の鳥を引く）
  maximized: boolean // このレーンだけで広がる
  folded: boolean // ほかのレーンが最大化されている間（畳んで消す）
  onToggleMaximize: () => void
  drag?: LaneDrag // タイトル帯のドラッグでレーンを入れ替える（入れ替えられないときは無い）
}) {
  const t = useMessages(kit)
  const sorts = usePluginState(kit, LANE_SORTS)
  const updateSorts = useUpdatePluginState(kit, LANE_SORTS)
  const rules: SortRules = sorts?.[project.id]?.[lane.id] ?? DEFAULT_SORT
  const setRules = (next: SortRules) =>
    updateSorts(now => ({ ...now, [project.id]: { ...now?.[project.id], [lane.id]: next } }))
  const [trayOpen, setTrayOpen] = useState(false)
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null)
  const [settling, setSettling] = useState(false)
  const first = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: maximized が変わったときだけ（最初の描画では隠さない）
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSettling(true)
    const timer = window.setTimeout(() => setSettling(false), LANE_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [maximized])
  const name = lane.name ?? t("Unsorted")
  const size = cardSizeOf(project, lane.id)
  return (
    <div
      className={`${styles.lane} ${drag?.markClass ?? ""}`}
      data-max={maximized}
      data-folded={folded}
      inert={folded}
      data-lane={lane.id}
      {...drag?.rowProps}
    >
      <div
        className={styles.title}
        data-draggable={drag !== undefined}
        onPointerDown={e => {
          // 帯の中のボタンと並べ方の一覧は、ドラッグのつまみにしない
          if (!(e.target as HTMLElement).closest("button, [role=dialog]")) drag?.gripProps.onPointerDown()
        }}
      >
        <button
          ref={setOpener}
          type="button"
          className={styles.sort}
          aria-label={t("Sort cards")}
          title={t("Sort cards")}
          aria-expanded={trayOpen}
          data-active={sortActive(rules)}
          onClick={() => setTrayOpen(v => !v)}
        >
          <SortIcon />
        </button>
        {name}
        <button
          type="button"
          className={styles.max}
          aria-label={maximized ? t("Restore size") : t("Maximize")}
          title={maximized ? t("Restore size") : t("Maximize")}
          onClick={onToggleMaximize}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        {trayOpen ? (
          <SortTray rules={rules} opener={opener} onChange={setRules} onClose={() => setTrayOpen(false)} />
        ) : null}
      </div>
      <div className={styles.cards} data-wrap={maximized && !settling} data-settling={settling}>
        {sortTickets(
          tickets,
          rules,
          project.tags.map(tag => tag.id),
        ).map(ticket => (
          <TicketCardView
            key={ticket.id}
            size={size}
            shows={project.cardShows}
            ticket={ticket}
            prefix={project.prefix}
            tags={tagsOf(project, ticket)}
            assignees={assigneesOf(ticket, workrooms)}
          />
        ))}
      </div>
    </div>
  )
}
