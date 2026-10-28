// ツリーの道具: 編集（ホイールでも紙のドラッグでも紙をずらさない。ミニマップを押すとハンドに替わる）と、base のハンド（紙をずらして全体を見る）の組
import { kit } from "./kit"

export const EDIT_TOOL = kit.defineTool({ id: "edit", title: "Edit tool", keepsPan: true })

export const TREE_TOOLS = kit.defineToolSet({
  id: "tree",
  tools: [EDIT_TOOL.id, "@matomezu/base:hand"],
})
