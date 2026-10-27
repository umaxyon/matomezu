// 定義の種類（core/catalog.ts の PARTS）ごとの、見た目の欄（definePluginUi に書く欄）と、定義を書く関数（pluginKit の define…）。
// どちらも種類ごとに意味が違う（アイテムは形と線で 2 つに分かれる・見た目の無い種類がある）ので、一覧から作らず、ここに種類ごとに書く。
// PARTS に種類を足して、ここに書かなければ型の誤り。書いた欄と関数があることは test/ui/part-ui.test.ts が確かめる
import type { Part } from "../core/catalog"
import type { PluginKit } from "../store/kit"
import type { UiCatalog } from "./plugin"

// 種類ごとの見た目の欄（ウィジェットは種類に付かないので入れない）
type ViewField = Exclude<keyof UiCatalog, "widgets">
type DefineName = Extract<keyof PluginKit<string, Record<never, never>>, `define${string}`>

export interface PartUi {
  views: readonly ViewField[] // 見た目の欄（見た目の無い種類は空）
  define: readonly DefineName[] // 定義を書く関数
}

export const PART_UI = {
  bookTypes: { views: [], define: ["defineBookType"] },
  items: { views: ["items", "connectors"], define: ["defineShape", "defineConnector"] },
  actions: { views: [], define: ["defineAction"] },
  settings: { views: ["settingViews"], define: ["defineSetting"] },
  presentations: { views: ["presentationViews"], define: ["definePresentation"] },
  tools: { views: ["toolIcons"], define: ["defineTool"] },
  toolSets: { views: [], define: ["defineToolSet"] },
  themes: { views: [], define: ["defineTheme"] },
  papers: { views: [], define: ["definePaper"] },
  skins: { views: [], define: ["defineSkin"] },
  commands: { views: ["commandIcons"], define: ["defineCommand"] },
  dialogs: { views: ["dialogViews"], define: ["defineDialog", "defineDialogWith"] },
} as const satisfies Record<Part, PartUi>
