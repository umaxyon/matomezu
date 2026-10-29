// ツリーの道具: 編集（ホイールでも紙のドラッグでも紙をずらさない。ミニマップを押すとハンドに替わる）と、base のハンド（紙をずらして全体を見る）の組
import { kit } from "./kit"

export const EDIT_TOOL = kit.defineTool({
  id: "edit",
  title: "Edit tool",
  keepsPan: true,
  performs: [kit.name("node-add"), kit.name("node-update"), kit.name("node-remove"), kit.name("node-move")],
})

export const TREE_TOOLS = kit.defineToolSet({
  id: "tree",
  tools: [EDIT_TOOL.id, "@matomezu/base:hand"],
})
