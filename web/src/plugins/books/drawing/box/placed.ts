// 箱の置き方（items/placed-def.ts の約束）: 大きさは w・h（無ければキャプションの幅と、本文が 5 行まで見える高さ）
import { z } from "zod"
import type { PlacedDef } from "../items/placed-def"
import { placedAt, placedSizeFields } from "../items/placed-def"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG } from "."
import { BOX_MIN, placedHeight, placedWidth } from "./size"

export const PlacedBoxSchema = z.strictObject({
  ...placedAt(),
  item: z.literal(BOX.id),
  ...placedSizeFields(BOX_MIN),
  props: BOX.props,
})
export type PlacedBox = z.infer<typeof PlacedBoxSchema>

export const BOX_PLACED: PlacedDef<PlacedBox> = {
  id: BOX.id,
  schema: PlacedBoxSchema,
  min: BOX_MIN,
  size: box => {
    const w = box.w ?? placedWidth(box.props)
    return { w, h: box.h ?? placedHeight(box.props, w) }
  },
  captionWidth: box => placedWidth(box.props),
  dialogs: { add: BOX_ADD_DIALOG.id, edit: BOX_EDIT_DIALOG.id },
}
