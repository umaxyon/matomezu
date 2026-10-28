// base の道具: 選択（アイテムを置き、選んで動かす）とハンド（ステージをドラッグすると紙をずらす）。組にまとめるのは、道具を使う見せ方のプラグイン。
// 道具の定義に、紙をずらさない道具の印（keepsPan）を書き足す。その道具の間は、ステージのホイールとミニマップでも紙をずらさない（ドラッグでずらすのは pans の道具だけ）
import type { CoreCatalog } from "../../../core/core-catalog"
import { toolDef } from "../../../core/tools"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface ToolExtras {
    keepsPan?: boolean
  }
}

// 道具 tool（無ければ null）の間、紙をずらさないか
export const keepsPan = (catalog: CoreCatalog, tool: string | null): boolean =>
  tool !== null && toolDef(catalog, tool).keepsPan === true

export const SELECT_TOOL = kit.defineTool({ id: "select", title: "Select tool", places: true })
export const HAND_TOOL = kit.defineTool({ id: "hand", title: "Hand tool", pans: true })
