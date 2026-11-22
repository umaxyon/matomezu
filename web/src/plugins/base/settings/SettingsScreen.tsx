// 設定画面の中身: 左に設定カテゴリの一覧（UI マッピングがスロット settings-categories に置いたウィジェット。題名は定義の settingsCategory.title）、右に選んだ設定カテゴリのウィジェットの中身。
// 押した設定カテゴリに右の中身が切り替わる（選んでいる設定カテゴリは画面の中で持ち、UI マッピングから無くなれば先頭の設定カテゴリ）。
// ダイアログに頼らないので、ほかの置き場にもそのまま置ける（要素の id は置いた所ごとに振る）。設定を書くコマンドは stage で行う
import { type ReactNode, useState } from "react"
import { useT } from "../../../ui/i18n"
import { useLayout, useUiCatalog } from "../../../ui/store-context"
import { SideTabs } from "../utils/SideTabs"
import { SETTINGS_CATEGORIES } from "./settings-screen"

// initial は、初めに選んでおく設定カテゴリのウィジェットの id（無ければ先頭）
export function SettingsScreen({ initial }: { initial?: string } = {}) {
  const t = useT() // 題名はほかのプラグインの文言の鍵でもある
  const widgets = useUiCatalog().widgets
  const categories = (useLayout().slots[SETTINGS_CATEGORIES] ?? []).flatMap(id => {
    const def = widgets.get(id)
    const View = def?.view as (() => ReactNode) | undefined
    return def?.settingsCategory && View ? [{ id, title: t(def.settingsCategory.title), View }] : []
  })
  const [current, setCurrent] = useState<string | undefined>(initial)
  const shown = categories.find(s => s.id === current) ?? categories[0]
  return (
    <SideTabs tabs={categories} selected={shown?.id} onSelect={setCurrent}>
      {shown && <shown.View />}
    </SideTabs>
  )
}
