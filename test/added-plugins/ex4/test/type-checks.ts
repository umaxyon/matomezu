// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { z } from "matomezu"
import { kit } from "../kit"

kit.defineConnector({
  id: "dot",
  kind: "connector",
  version: 1,
  title: "relation",
  capabilities: [],
  // @ts-expect-error つなぐものはツールボックスに出せない（監査 B5）
  toolbox: true,
  props: z.strictObject({}),
  tokens: [],
})
