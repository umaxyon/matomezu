// 伸びる向きの設定のコンポーネント（設定の項目 grow のビュー）: 5 つの向きから選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting } from "../../base/ui"
import { GROWS, type Grow } from "./grow"
import { GROW_ICONS } from "./icons"
import { kit } from "./kit"

export const GROW_NAMES = { up: "Up", down: "Down", left: "Left", right: "Right", center: "Center" } as const

export function useGrowOptions() {
  const t = useMessages(kit)
  return GROWS.map(g => ({ value: g, label: t(GROW_NAMES[g]), icon: GROW_ICONS[g] }))
}

export function GrowSetting(props: SettingControlProps<Grow>) {
  return <ChoiceSetting {...props} options={useGrowOptions()} />
}
