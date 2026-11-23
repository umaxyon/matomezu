// ex10 のステージの上の行に置くタブ（押すと、画面の場所に入るプラグイン状態 tab が変わる）
import { useMessages, usePluginState, useSetPluginState } from "matomezu/ui"
import { EX10_TAB } from "."
import { kit } from "./kit"

export function Ex10Tabs() {
  const t = useMessages(kit)
  const tab = usePluginState(kit, EX10_TAB)
  const setTab = useSetPluginState(kit, EX10_TAB)
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
