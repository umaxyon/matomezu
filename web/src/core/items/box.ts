// 箱: 文字を入れられる四角
import { z } from "zod"
import { defineItem } from "../def/item"

export const BOX = defineItem({
  id: "shape.box",
  kind: "shape",
  version: 1,
  title: "箱",
  capabilities: ["connectable", "resizable", "hasText"],
  props: z.strictObject({ text: z.string() }),
  size: { w: 160, h: 64 },
  tokens: [
    { id: "box.fill", fallback: "fill" },
    { id: "box.line", fallback: "line" },
    { id: "box.text", fallback: "text" },
  ],
})
