// ex10 のステージの上の行に置くタブ（押すと窓の外の、場所に入れる画面の状態 tab が変わる）
import { useMessages, usePlacedState, useSetPlacedState } from "matomezu/ui"
import { EX10_TAB } from "."
import { kit } from "./kit"

export function Ex10Tabs() {
  const t = useMessages(kit)
  const tab = usePlacedState(kit, EX10_TAB) ?? "one"
  const setTab = useSetPlacedState(kit, EX10_TAB)
  return (
    <div data-ex10-tabs data-tab={tab}>
      <button type="button" aria-pressed={tab === "one"} onClick={() => setTab("one")}>
        {t("tabOne")}
      </button>
      <button type="button" aria-pressed={tab === "two"} onClick={() => setTab("two")}>
        {t("tabTwo")}
      </button>
    </div>
  )
}
