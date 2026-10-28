// ツリーの道具: 編集（どの操作でも紙をずらさない）と、base のハンド（紙をずらして全体を見る）の組
import { kit } from "./kit"

export const EDIT_TOOL = kit.defineTool({ id: "edit", title: "Edit tool", keepsPan: true })

export const TREE_TOOLS = kit.defineToolSet({
  id: "tree",
  tools: [EDIT_TOOL.id, "@matomezu/base:hand"],
})
