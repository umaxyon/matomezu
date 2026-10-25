// 道具: ステージでポインタが何をするか。select は選んで動かす、hand はドラッグで紙をずらす。reparent は select と同じに動く。
// 道具は組にまとめ、ブックのタイプが使う組を名指す（BookTypeDef の tools）。今の道具は組ごとに窓の状態（Workspace の tools）が持つので、
// 同じ組を使うステージどうしは、開いているブックやそのタイプが違っても同じ道具になる

import { bookType, type CoreCatalog } from "./core-catalog"
import type { Stage } from "./stage"

export type Tool = "select" | "reparent" | "hand"

// 道具の組。並びは回す順で、先頭が初めの道具
export const TOOL_SETS = {
  paper: ["select", "reparent", "hand"],
} as const satisfies Record<string, readonly Tool[]>

export type ToolSetId = keyof typeof TOOL_SETS

// 組ごとの今の道具（替えたことの無い組は持たず、組の初めの道具を使う）
export type Tools = Readonly<Partial<Record<ToolSetId, Tool>>>

// ステージで使う道具の組（何も開いていないか、開いているブックのタイプが道具を使わなければ null）
export function toolSetOf(catalog: CoreCatalog, stage: Stage): ToolSetId | null {
  return stage.opened ? (bookType(catalog, stage.opened.type).tools ?? null) : null
}

export function toolIn(tools: Tools, set: ToolSetId): Tool {
  return tools[set] ?? TOOL_SETS[set][0]
}

// 組の回す順で次の道具
export function nextTool(set: ToolSetId, tool: Tool): Tool {
  const order: readonly Tool[] = TOOL_SETS[set]
  return order[(order.indexOf(tool) + 1) % order.length] ?? TOOL_SETS[set][0]
}

export const hasTool = (set: ToolSetId, tool: Tool): boolean => (TOOL_SETS[set] as readonly Tool[]).includes(tool)
