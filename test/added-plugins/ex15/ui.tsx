// ex15 の見た目: たなのスクリーンを描くウィジェット。フォルダの直下のエントリを並べ、フォルダ・ブック・バインダの行を押すと中へ入る
import {
  definePluginUi,
  defineWidget,
  useFolderEntries,
  useMessages,
  usePluginState,
  useResetPluginState,
  useSetPluginState,
} from "matomezu/ui"
import { EX15, SHELF_FOLDED, SHELF_FOLDER, SHELF_SCREEN } from "."
import { kit } from "./kit"

function ShelfScreenView() {
  const t = useMessages(kit)
  const folded = usePluginState(kit, SHELF_FOLDED) === true
  const setFolded = useSetPluginState(kit, SHELF_FOLDED)
  const resetFolded = useResetPluginState(kit, SHELF_FOLDED)
  const folder = usePluginState(kit, SHELF_FOLDER)
  const setFolder = useSetPluginState(kit, SHELF_FOLDER)
  // 読む: このフォルダの直下のエントリ（並びの順。フォルダが無ければ undefined）
  const entries = useFolderEntries(folder) ?? []
  return (
    <section>
      <h1>{t("shelf")}</h1>
      <button type="button" onClick={() => (folded ? resetFolded() : setFolded(true))}>
        {t(folded ? "unfold" : "fold")}
      </button>
      {/* たたんでも描いたまま隠す（スクリーンの定義の shownLibraryAppearances が、見せていないと答える） */}
      <ul hidden={folded}>
        {entries.map(e => (
          <li key={e.id}>
            {e.kind === "page" ? (
              e.name
            ) : (
              <button type="button" onClick={() => setFolder(e.id)}>
                {e.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export const EX15_SCREEN_VIEW = defineWidget({
  id: kit.name("shelf-screen-view"),
  slots: [SHELF_SCREEN.id],
  view: ShelfScreenView,
})

export const EX15_UI = definePluginUi(EX15, { widgets: [EX15_SCREEN_VIEW] })

export default EX15_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex15:shelf-screen-view": typeof EX15_SCREEN_VIEW
  }
}
