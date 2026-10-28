// 紙の道具: 付け替えの道具と、紙の道具の組（選択・付け替え・ハンド。回す順）。子を持てる形を置くブックのタイプが組を名指す
import { kit } from "../kit"

export const REPARENT_TOOL = kit.defineTool({ id: "reparent", title: "Reparent tool" })

export const PAPER_TOOLS = kit.defineToolSet({
  id: "paper",
  tools: ["@matomezu/base:select", REPARENT_TOOL.id, "@matomezu/base:hand"],
})
