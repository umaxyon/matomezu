// 定義の種類（core/catalog.ts の PARTS）ごとの、見た目のフィールド（definePluginUi に書くフィールド）と、定義を書く関数（pluginKit の define…）。
// どちらも種類ごとに意味が違う（アイテムは形と線で 2 つに分かれる・見た目の無い種類がある）ので、一覧から作らず、ここに種類ごとに書く。
// PARTS に種類を足して、ここに書かなければ型の誤り。書いたフィールドと関数があることは test/ui/part-ui.test.ts が確かめる
import type { Part } from "../core/catalog"
import type { PluginKit } from "../store/kit"
import type { UiCatalog } from "./plugin"

// 種類ごとの見た目のフィールド（ウィジェットは種類に付かないので入れない）
type ViewField = Exclude<keyof UiCatalog, "widgets">
type DefineName = Extract<keyof PluginKit<string, Record<never, never>>, `define${string}`>

export interface PartUi {
  views: readonly ViewField[] // 見た目のフィールド（見た目の無い種類は空）
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

// 定義の種類（PARTS）に入らない定義オブジェクトを書く関数の名前（キーの既定の割り当て・言語パック。プラグインの keys・languages に渡す。見た目は無い）。
// PARTS に入れると、id を core/catalog.ts に 1 つずつ書き足す決まりがかかるので入れない。kit の関数の書き忘れを test/ui/part-ui.test.ts が見るためだけの一覧
export const NON_PART_DEFINES = ["defineKey", "defineLanguagePack"] as const satisfies readonly DefineName[]
