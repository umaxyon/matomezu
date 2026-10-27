// ex7 の形「木箱」: 積んだ荷の重さ（load）を持ち、ex6 の重さのメソッド "ex6:weight" に答える。
// ex6-spec を型だけ読むと（index.ts）、形の定義オブジェクトに "ex6:weight" が書ける（ex6-spec が拡張ポイントに書き足したもの）
import { z } from "matomezu"
import { kit } from "./kit"

export const CRATE = kit.defineShape({
  id: "crate",
  kind: "shape",
  version: 1,
  title: "crate",
  capabilities: ["resizable"],
  toolbox: true,
  props: z.strictObject({ load: z.number().min(0).default(0) }),
  size: { w: 80, h: 60 },
  tokens: [],
  "ex6:weight": item => item.props.load,
})

// 置き場: 木箱を置くタイプ
export const YARD = kit.defineBookType({
  id: "yard",
  version: 1,
  title: "yard",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: { allowed: [kit.name("crate")], defaults: [kit.name("crate")] },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "@matomezu/paper:paper",
})
