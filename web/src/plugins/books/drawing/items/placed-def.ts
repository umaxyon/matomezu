// 図面に置けるアイテムの、置き方の約束: 置いたアイテムのデータの形と、置き方の層（items）が大きさ・縮め方・中身を変えたあとの整え方・ダイアログを引く所。
// アイテムごとに 1 つ書き（box/placed.ts・list/placed.ts）、図面の表（../placed.ts）が並べる。置き方の層はアイテムを名指しせず、表から引く
import { z } from "zod"
import type { Point, Size } from "../../../../core/geom"
import type { DialogArgsOf } from "../../../../store/dialogs"
import type { DialogId } from "../../../../store/tables"

// 渡す値がちょうど A のダイアログの id
type DialogTaking<A> = {
  [K in DialogId]: [DialogArgsOf<K>] extends [A] ? ([A] extends [DialogArgsOf<K>] ? K : never) : never
}[DialogId]

export interface PlacedDef<Item extends { item: string; props: { caption: string } }> {
  id: Item["item"] // アイテムの id
  schema: z.ZodType<Item> // 置いたアイテムのデータの形（位置・大きさ・項目。中身を持つアイテムは中身も）
  min?: Size // 一番小さい大きさ（大きさを変えられるアイテムだけ）
  size: (item: Item) => Size // 大きさ（w・h が無ければ、置いたときの幅と高さ）
  captionWidth: (item: Item) => number // キャプションが PLACE_CAPTION 字まで切れずに見える幅（キャプションで広げる幅と、縮めてよい横の下限）
  settle?: (item: Item) => Item // 項目を変えたあとに、項目に合わせて中身を整える
  dialogs: {
    add: DialogTaking<{ page: string; at: Point }> // 置く前に中身を決める追加のダイアログ
    edit: DialogTaking<{ page: string; item: string }> // 中身を変える編集のダイアログ
  }
}

// 置いたアイテムに共通の欄。データの欄の並びは id・x・y・item・w・h・props（・中身）にする
// id（ブックの中で重ならない短い id）と位置（紙の左上から）
export const placedAt = () => ({ id: z.string().min(1), x: z.number(), y: z.number() })
// 大きさ（一番小さい大きさ min 以上。無ければ置いたときの大きさ）
export const placedSizeFields = (min: Size) => ({
  w: z.number().min(min.w).optional(),
  h: z.number().min(min.h).optional(),
})
