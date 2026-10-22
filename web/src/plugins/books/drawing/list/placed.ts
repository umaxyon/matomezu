// リストの置き方（items/placed-def.ts の約束）: 大きさは w・h（無ければキャプションの幅と、行 3 つぶんの空きの高さ）。中身は行（children の順）。
// 項目を変えたら、チェックリストでなくなったリストの行からチェックを消す
import { z } from "zod"
import type { PlacedDef } from "../items/placed-def"
import { placedAt, placedSizeFields } from "../items/placed-def"
import { LIST, LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ListRowSchema, type RowProps } from "."
import { LIST_MIN, LIST_SIZE, listCaptionWidth, placedListWidth } from "./size"

export const PlacedListSchema = z.strictObject({
  ...placedAt(),
  item: z.literal(LIST.id),
  ...placedSizeFields(LIST_MIN),
  props: LIST.props,
  children: z.array(ListRowSchema).optional(),
})
export type PlacedList = z.infer<typeof PlacedListSchema>

// チェックリストでないリストの行から、チェックの状態を消す（チェックリストをやめたとき）
export function settleChecks(list: PlacedList): PlacedList {
  const rows = list.children ?? []
  if (list.props.checklist || !rows.some(r => r.props.checked !== undefined)) return list
  const children = rows.map(r => {
    const { checked: _, ...props } = r.props
    return { ...r, props: props as RowProps }
  })
  return { ...list, children }
}

export const LIST_PLACED: PlacedDef<PlacedList> = {
  id: LIST.id,
  schema: PlacedListSchema,
  min: LIST_MIN,
  size: list => ({ w: list.w ?? placedListWidth(list.props.caption), h: list.h ?? LIST_SIZE.h }),
  captionWidth: list => listCaptionWidth(list.props.caption),
  settle: settleChecks,
  dialogs: { add: LIST_ADD_DIALOG.id, edit: LIST_EDIT_DIALOG.id },
}
