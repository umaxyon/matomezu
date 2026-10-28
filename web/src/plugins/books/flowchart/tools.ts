// フローチャートの道具: base の選択とハンドの組（形は子を持たないので、紙の付け替えの道具は入れない）
import { kit } from "./kit"

export const FLOWCHART_TOOLS = kit.defineToolSet({
  id: "flowchart",
  tools: ["@matomezu/base:select", "@matomezu/base:hand"],
})
