// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { z } from "matomezu"
import { kit } from "../kit"

kit.defineShape({
  id: "plain",
  kind: "shape",
  version: 1,
  title: "tiles",
  capabilities: [],
  toolbox: false,
  props: z.strictObject({ look: z.string().optional() }),
  size: { w: 10, h: 10 },
  tokens: [],
  // @ts-expect-error 個別のテーマの項目は props にある名前だけ
  themeProp: "theme",
})

kit.defineShape({
  id: "weighed",
  kind: "shape",
  version: 1,
  title: "tiles",
  capabilities: [],
  toolbox: false,
  props: z.strictObject({}),
  size: { w: 10, h: 10 },
  tokens: [],
  // @ts-expect-error ex6-spec を読まないプロジェクトには、ex6-spec が拡張ポイントに書き足した "ex6:weight" は無い
  "ex6:weight": () => 1,
})
