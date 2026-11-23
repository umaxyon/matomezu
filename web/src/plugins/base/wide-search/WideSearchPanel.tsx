// 横断検索のパネル（左サイドパネルのタブ）: 検索の入力と、モードの切り替え、選んだモードのパネル。
// モードはスロット wide-search-modes に置かれたウィジェットで、置いた順に並べる。最後に選んだモードは覚え、開き直したら同じモードで開く
import { useState } from "react"
import { useMessages, useT } from "../../../ui/i18n"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useLayout, useUiCatalog } from "../../../ui/store-context"
import { ActionButton, controlClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { WIDE_SEARCH_WORDS_KEY_SCOPE } from "./index"
import { WIDE_SEARCH_MODES, type WideSearchModeProps } from "./slots"
import { WIDE_SEARCH_MODE } from "./state"
import styles from "./WideSearch.module.css"

export function WideSearchPanel() {
  const t = useMessages(kit)
  const translate = useT()
  const placed: readonly string[] = useLayout().slots[WIDE_SEARCH_MODES] ?? []
  const widgets = useUiCatalog().widgets
  const modes = placed.flatMap(id => {
    const w = widgets.get(id)
    return w?.wideSearchMode
      ? [{ id, title: w.wideSearchMode.title, View: w.view as (p: WideSearchModeProps) => React.ReactNode }]
      : []
  })
  const chosen = usePluginState(kit, WIDE_SEARCH_MODE)
  const setChosen = useSetPluginState(kit, WIDE_SEARCH_MODE)
  const [term, setTerm] = useState("")
  const mode = modes.find(m => m.id === chosen) ?? modes[0]
  return (
    <div className={styles.panel}>
      <fieldset className={styles.modes} aria-label={t("Search modes")}>
        {modes.map(m => (
          <ActionButton key={m.id} pressed={m.id === mode?.id} onClick={() => setChosen(m.id)}>
            {translate(m.title)}
          </ActionButton>
        ))}
      </fieldset>
      <input
        className={controlClass}
        aria-label={t("Search words")}
        data-key-scope={WIDE_SEARCH_WORDS_KEY_SCOPE.id}
        // biome-ignore lint/a11y/noAutofocus: 開いたら、すぐ打てるように検索語のテキストFormに焦点を置く（ボタンで開いても、キーで開いても）
        autoFocus
        value={term}
        onChange={e => setTerm(e.target.value)}
      />
      {mode && <mode.View key={mode.id} term={term} setTerm={setTerm} />}
    </div>
  )
}
