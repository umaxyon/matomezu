// スクラップボックスのプラグイン: 図面に置く、スクラップ（base の ScrapSchema。指すページの id・見る範囲・倍率）を見せる枠の形。
// 項目はスクラップと、省ける枠線（line）で、置いた所のデータとして持つ（スクラップトレイのスクラップとはつながらない）。大きさは見る範囲 × 倍率で決まり、角のつまみを引くと、比を保ったまま倍率が変わる（辺のつまみは無い）。
// 枠線は、無ければテーマの線の色（テーマキー scrap-line）、"none" なら引かない、色（代表色の名前か #rrggbb）ならその色。
// 線はつなげる。子は持てない。ツールボックスには出さず、スクラップトレイから置く。形は使われる所を知らない（使うかはページのタイプが選ぶ）
import { z } from "zod"
import type { ShapeEditArgs } from "../../../plugin-api"
import { defineBuiltin } from "../../../plugin-api/builtin"
import {
  ColorSchema,
  SCRAP_SCALE_MAX,
  SCRAP_SCALE_TOO_SMALL,
  type Scrap,
  ScrapSchema,
  scrapScaleFits,
  scrapScaleMin,
  scrapSize,
} from "../../base"
import { kit } from "./kit"

const DEFAULT = { w: 240, h: 160 }
// つまみで縮められる一番小さい大きさ（つかめて、見分けられる大きさ）
const MIN = { w: 24, h: 24 }

// 見る範囲 area で幅 w になる倍率（スクラップの倍率の取れる範囲に寄せる。見る範囲 × 倍率を切り上げた幅が w を超えないよう、小数 6 桁で切り捨てる。
// 下限は見る範囲で決まる）
export const scaleForWidth = (area: Scrap["area"], w: number): number =>
  Math.min(
    Math.max(Math.floor((Math.floor(w) * 1e6) / area.w) / 1e6, Math.ceil(scrapScaleMin(area) * 1e6) / 1e6),
    SCRAP_SCALE_MAX,
  )

// 枠線の色のテーマキー（テーマが決めなければ、紙の線の色）
export const SCRAP_LINE = { id: kit.name("scrap-line"), fallback: "paper-line" } as const
// 枠線を引かないときの値
export const NO_LINE = "none"

// 編集のダイアログ（見る範囲と倍率。開いている間、その形に編集ロックを掛ける）
export const SCRAP_BOX_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({
  id: "scrap-box-edit",
  edits: a => [a.item],
})

export const SCRAP_BOX = kit.defineShape({
  id: "shape-scrap-box",
  kind: "shape",
  version: 1,
  title: "Scrap box",
  capabilities: ["connectable", "resizable", "@matomezu/slide:on-slide"], // 形だけの並び（slide）にも置ける（回せない）
  toolbox: false,
  scrapFrame: true,
  dialogs: { edit: SCRAP_BOX_EDIT_DIALOG.id },
  props: ScrapSchema.extend({ line: z.union([z.literal(NO_LINE), ColorSchema]).optional() })
    .refine(scrapScaleFits, SCRAP_SCALE_TOO_SMALL)
    .describe(
      "A view of a part of another page, drawn live from that page (nothing is copied): page is that page's id, area the part shown in that page's own pixels (x and y from its top-left; on an image page, the image's own pixels, without the paper's margin), scale how much it is enlarged (1 is the same size; at least what makes the shorter side 24 pixels, or 1 for a smaller area). Its size is area × scale, so w and h are not kept: item-resize with w changes scale (the height follows). It shows No Data while the page does not exist. line is the border around it: without it the theme's line colour, \"none\" for no border, or a colour (a theme colour name or #rrggbb)",
    ),
  size: DEFAULT,
  min: MIN,
  sizeOf: s => scrapSize(s.props),
  resizedTo: (s, size) => ({ ...s, props: { ...s.props, scale: scaleForWidth(s.props.area, size.w) } }),
  stretch: "ratio",
  tokens: [SCRAP_LINE],
})

export const SCRAP_BOX_PLUGIN = defineBuiltin(kit.plugin({ items: [SCRAP_BOX], dialogs: [SCRAP_BOX_EDIT_DIALOG] }))

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/scrap:shape-scrap-box": typeof SCRAP_BOX
  }
  interface DialogTable {
    "@matomezu/scrap:scrap-box-edit": typeof SCRAP_BOX_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
