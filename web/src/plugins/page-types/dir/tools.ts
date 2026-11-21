// ディレクトリ構成図の道具: 鉛筆（中身を選んで足す・書く・消す・付け替える）と、base のハンド（紙をずらして見る。▸・▾ で開け閉めはできる）の組
import { kit } from "./kit"

export const PENCIL_TOOL = kit.defineTool({
  id: "pencil",
  title: "Pencil",
  performs: [
    kit.name("node-add"),
    kit.name("node-update"),
    kit.name("node-remove"),
    kit.name("node-move"),
    kit.name("folder-sort"),
  ],
})

export const DIR_TOOLS = kit.defineToolSet({
  id: "dir",
  tools: [PENCIL_TOOL.id, "@matomezu/base:hand"],
})
