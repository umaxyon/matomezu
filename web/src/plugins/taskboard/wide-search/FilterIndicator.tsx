// プロジェクトの題の帯の、絞りが効いている間の印: 押した状態のろうとのボタン。押すと絞りを全部外す（左サイドパネルの「検索中」の ×・横断検索のチケットのモードと同じ動き）。
// 絞っていない間は出さない（サイドパネルを閉じていても、絞っていると分かる）
import { useMessages, usePluginState, useUpdatePluginState } from "../../../plugin-api/ui"
import { IconButton } from "../../base/ui"
import { FilterIcon } from "../icons"
import { kit } from "../kit"
import { TICKET_FILTER } from "."
import styles from "./FilterIndicator.module.css"
import { isFiltering } from "./filter"

export function FilterIndicator() {
  const t = useMessages(kit)
  const filter = usePluginState(kit, TICKET_FILTER)
  const update = useUpdatePluginState(kit, TICKET_FILTER)
  if (!isFiltering(filter)) return null
  return (
    <IconButton
      small
      className={styles.pressed}
      label={t("Filtering, press to clear")}
      aria-pressed="true"
      onClick={() => update(() => undefined)}
    >
      <FilterIcon />
    </IconButton>
  )
}
