// タスクボードの上の、絞りが効いている間の印: 「検索中: …」と、絞りを全部外す ×
import { useMessages } from "../../../plugin-api/ui"
import { IconButton } from "../../base/ui"
import { kit } from "../kit"
import styles from "./FilterBanner.module.css"
import type { TicketFilter } from "./filter"

export function FilterBanner({ filter, onClear }: { filter: TicketFilter; onClear: () => void }) {
  const t = useMessages(kit)
  const parts = [
    filter.term === "" ? "" : `"${filter.term}"`,
    filter.projects.length > 0 ? t("{n} projects", { n: filter.projects.length }) : "",
    filter.tags.length > 0 ? t("{n} tags", { n: filter.tags.length }) : "",
    filter.priorities.length > 0 ? t("{n} priorities", { n: filter.priorities.length }) : "",
  ].filter(p => p !== "")
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        {t("Filtering")}: {parts.join(" · ")}
      </span>
      <IconButton small label={t("Clear the filter")} onClick={onClear}>
        ×
      </IconButton>
    </div>
  )
}
