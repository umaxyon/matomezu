// base の道具: 選択（アイテムを置き、選んで動かす）とハンド（ステージをドラッグすると紙をずらす）。組にまとめるのは、道具を使う見せ方のプラグイン。
// 道具の定義に、紙をずらさない道具の印（keepsPan）を書き足す。その道具の間は、ステージのホイールで紙をずらさない（ドラッグでずらすのは pans の道具だけ）。
// ミニマップを押すと、組の紙をずらす道具に替える
import type { ToolId } from "../../../core/catalog"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Library } from "../../../core/library"
import { toolDef, toolSetOf, toolsIn } from "../../../core/tools"
import { usableIn, type Workspace } from "../../../core/workspace"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface ToolExtras {
    keepsPan?: boolean
  }
}

// 道具 tool（無ければ null）の間、紙をずらさないか
export const keepsPan = (catalog: CoreCatalog, tool: string | null): boolean =>
  tool !== null && toolDef(catalog, tool).keepsPan === true

// 組 set の、ドラッグで紙をずらす道具（無ければ null）
export const panningTool = (catalog: CoreCatalog, set: string): ToolId | null =>
  toolsIn(catalog, set).find(id => toolDef(catalog, id).pans === true) ?? null

export const SELECT_TOOL = kit.defineTool({ id: "select", title: "Select tool", places: true })
export const HAND_TOOL = kit.defineTool({ id: "hand", title: "Hand tool", pans: true })

// ステージ id の道具の組の、使えない道具（回す順）
export function unusableTools(catalog: CoreCatalog, ws: Workspace, id: string, books: Library): readonly ToolId[] {
  const stage = ws.stages.find(s => s.id === id)
  const set = stage ? toolSetOf(catalog, stage) : null
  if (!stage || !set) return []
  const usable = usableIn(catalog, stage, books)
  return toolsIn(catalog, set).filter(tool => !usable(tool))
}
