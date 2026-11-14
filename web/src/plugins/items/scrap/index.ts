// スクラップボックスのプラグイン: 図面に置く、スクラップ（base の ScrapSchema。指すページの id・見る範囲・倍率）を見せる枠の形。
// 項目はスクラップその物で、置いた所のデータとして持つ（スクラップトレイのスクラップとはつながらない）。大きさは見る範囲 × 倍率で決まり、つまみでは変えない。
// 線はつなげる。子は持てない。ツールボックスには出さず、スクラップトレイから置く。形は使われる所を知らない（使うかはブックのタイプが選ぶ）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { ScrapSchema, scrapSize } from "../../base"
import { kit } from "./kit"

const DEFAULT = { w: 240, h: 160 }

export const SCRAP_BOX = kit.defineShape({
  id: "shape-scrap-box",
  kind: "shape",
  version: 1,
  title: "Scrap box",
  capabilities: ["connectable"],
  toolbox: false,
  props: ScrapSchema.describe(
    "A view of a part of another page, drawn live from that page (nothing is copied): page is that page's id, area the part shown in that page's own pixels (x and y from its top-left), scale how much it is enlarged (1 is the same size). Its size is area × scale, so w and h are not taken. It shows No Data while the page does not exist",
  ),
  size: DEFAULT,
  sizeOf: s => scrapSize(s.props),
  tokens: [],
})

export const SCRAP_BOX_PLUGIN = defineBuiltin(kit.plugin({ items: [SCRAP_BOX] }))

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/scrap:shape-scrap-box": typeof SCRAP_BOX
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
