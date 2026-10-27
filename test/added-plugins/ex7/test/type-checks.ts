// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { z } from "matomezu"
import { kit } from "../kit"

kit.defineShape({
  id: "wrong-weight",
  kind: "shape",
  version: 1,
  title: "crate",
  capabilities: [],
  toolbox: false,
  props: z.strictObject({ load: z.number() }),
  size: { w: 10, h: 10 },
  tokens: [],
  // @ts-expect-error "ex6:weight" は数を返す（ex6-spec が拡張ポイントに書き足した形に合わない）
  "ex6:weight": item => String(item.props.load),
})
