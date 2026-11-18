// コントロールセンターの書庫の画面: 題の帯と最大化ボタンの下に、書庫（base の LibraryView）を描く。背景はプロジェクトの領域と同じ奥の面
import { useMessages } from "../../plugin-api/ui"
import { LibraryView, Panel, TitledArea } from "../base/ui"
import { kit } from "./kit"
import styles from "./LibraryArea.module.css"

export function LibraryArea({ maximized, onToggleMaximize }: { maximized: boolean; onToggleMaximize: () => void }) {
  const t = useMessages(kit)
  return (
    <Panel recess>
      <TitledArea
        className={styles.area}
        title={t("Library")}
        maximized={maximized}
        onToggleMaximize={onToggleMaximize}
      >
        <LibraryView />
      </TitledArea>
    </Panel>
  )
}
