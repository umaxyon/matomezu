// 道具（core/def/tool.ts）の組と、今の道具。今の道具は組ごとに窓の状態（Workspace の tools）が持つので、
// 同じ組を使うステージどうしは、開いているブックやそのタイプが違っても同じ道具になる

import type { ToolId } from "./catalog"
import { bookType, type CoreCatalog } from "./core-catalog"
import type { ToolDef, ToolSetDef } from "./def/tool"
import { fail } from "./errors"
import type { Stage } from "./stage"

// 組ごとの今の道具（替えたことの無い組は持たず、組の初めの道具を使う）。鍵は組の id、値は道具の id
export type Tools = Readonly<Record<string, string>>

const setOf = (catalog: CoreCatalog, id: string): ToolSetDef => catalog.toolSets.get(id) ?? fail("E114", { id })

// 道具の定義
export const toolDef = (catalog: CoreCatalog, id: string): ToolDef => catalog.tools.get(id) ?? fail("E115", { id })

// ステージで使う道具の組の id（何も開いていないか、開いているブックのタイプが道具を使わなければ null）
export function toolSetOf(catalog: CoreCatalog, stage: Pick<Stage, "opened">): string | null {
  return stage.opened ? (bookType(catalog, stage.opened.type).tools ?? null) : null
}

// 組の道具（回す順。組の道具があることは組み立てが確かめるので、表の道具の id として返す）
export const toolsIn = (catalog: CoreCatalog, set: string): readonly ToolId[] =>
  setOf(catalog, set).tools as readonly ToolId[]

// 組の今の道具（組に無い道具を覚えていれば、組の初めの道具）
export function toolIn(catalog: CoreCatalog, tools: Tools, set: string): ToolId {
  const order = toolsIn(catalog, set)
  return order.find(id => id === tools[set]) ?? order[0] ?? fail("E114", { id: set })
}

// 組の回す順で次の道具
export function nextTool(catalog: CoreCatalog, set: string, tool: string): ToolId {
  const order: readonly string[] = toolsIn(catalog, set)
  return toolsIn(catalog, set)[(order.indexOf(tool) + 1) % order.length] ?? toolIn(catalog, {}, set)
}

export const hasTool = (catalog: CoreCatalog, set: string, tool: string): boolean =>
  (toolsIn(catalog, set) as readonly string[]).includes(tool)

// 組のアイテムを置く道具（無ければ null）
export const placingTool = (catalog: CoreCatalog, set: string): ToolId | null =>
  toolsIn(catalog, set).find(id => catalog.tools.get(id)?.places === true) ?? null
