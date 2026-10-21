// 箱: 文字を入れられる四角
import { z } from "zod"
import { defineItem } from "../../../core/def/item"

export const BOX = defineItem({
  id: "shape.box",
  kind: "shape",
  version: 1,
  title: "Box",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({ text: z.string() }),
  size: { w: 160, h: 64 },
  tokens: [
    { id: "box.fill", fallback: "fill" },
    { id: "box.line", fallback: "line" },
    { id: "box.text", fallback: "text" },
  ],
})
