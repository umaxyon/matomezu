// 書庫の画面（題の帯と最大化ボタンだけ。中身は空）。背景はプロジェクトの領域と同じ奥の面
import { useMessages } from "../../plugin-api/ui"
import { Panel, TitledArea } from "../base/ui"
import { kit } from "./kit"

export function LibraryScreen({ maximized, onToggleMaximize }: { maximized: boolean; onToggleMaximize: () => void }) {
  const t = useMessages(kit)
  return (
    <Panel recess>
      <TitledArea title={t("Library")} maximized={maximized} onToggleMaximize={onToggleMaximize} />
    </Panel>
  )
}
