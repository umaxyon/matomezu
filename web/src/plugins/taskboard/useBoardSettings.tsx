// 利用者の設定 2 つ（プロジェクトの並びと、出しているボード）を読み、変えるフック。変えられるか（コントロールセンターが変えさせない項目でないか）を先に問い、変えられなければ押せなくする。
// 設定の値は窓のカレントのステージのコマンド settings-set で書く（ステージの無いコントロールセンターの画面が、窓のステージを借りる）
import { useAllowed, useCommand, useUserSetting, useWindowStage } from "../../plugin-api/ui"
import { PROJECT_ORDER, SHOWN_PROJECTS } from "./settings"

const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(v => typeof v === "string") ? value : undefined

export interface BoardSettings {
  order: readonly string[] // 利用者の並び（プロジェクトの id。消したプロジェクトの id も残る）
  shown: readonly string[] | undefined // 出しているボード（まだ選んでいなければ undefined）
  canChange: boolean // 並びも出しているボードも変えられるか
  setOrder: (ids: readonly string[]) => void
  setShown: (ids: readonly string[]) => void
}

export function useBoardSettings(): BoardSettings {
  const stage = useWindowStage()
  const set = useCommand(stage, "@matomezu/base:settings-set")
  const orderAllowed = useAllowed(stage, "@matomezu/base:settings-set", { settings: [PROJECT_ORDER.id] }).ok
  const shownAllowed = useAllowed(stage, "@matomezu/base:settings-set", { settings: [SHOWN_PROJECTS.id] }).ok
  return {
    order: stringList(useUserSetting(PROJECT_ORDER.id)) ?? [],
    shown: stringList(useUserSetting(SHOWN_PROJECTS.id)),
    canChange: set.enabled && orderAllowed && shownAllowed,
    setOrder: ids => set.run({ [PROJECT_ORDER.id]: [...ids] }),
    setShown: ids => set.run({ [SHOWN_PROJECTS.id]: [...ids] }),
  }
}
