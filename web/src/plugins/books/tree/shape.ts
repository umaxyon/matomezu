// 節の形: 箱（枠と塗りのある四角）か、下線（塗りと枠を描かず、キャプションの下に線を引く。マインドマップの見た目）。
// ブックとページの設定の項目で持ち、ページはブックを継承できる。色はテーマ（と節の色）のまま
import { z } from "zod"
import { kit } from "./kit"

export const NODE_SHAPES = ["box", "underline"] as const
export type NodeShape = (typeof NODE_SHAPES)[number]

// 何も選んでいないときの形
export const DEFAULT_NODE_SHAPE: NodeShape = "box"

export const NODE_SHAPE = kit.defineSetting({
  id: "node-shape",
  title: "Node shape",
  schema: z.enum(NODE_SHAPES),
  default: DEFAULT_NODE_SHAPE,
})
