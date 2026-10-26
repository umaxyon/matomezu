// 形のプラグイン: キャプションを 1 行持つ 8 つの形（角丸・ひし形・平行四辺形とその逆・台形とその逆・六角形・円）と、その追加と編集のダイアログ。
// 形は使われる所を知らない。使うかはブックのタイプが選ぶ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import {
  type CIRCLE,
  type DIAMOND,
  type HEXAGON,
  type PARALLELOGRAM,
  type PARALLELOGRAM_REVERSED,
  type ROUNDED,
  SHAPE_EDIT_DIALOG,
  SHAPE_TOKENS,
  SHAPES,
  type TRAPEZOID,
  type TRAPEZOID_REVERSED,
} from "./shapes"

export const SHAPE_PLUGIN = defineBuiltin(
  kit.plugin({
    items: SHAPES.map(s => s.item),
    tokens: SHAPE_TOKENS,
    dialogs: [...SHAPES.map(s => s.add), SHAPE_EDIT_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/shape:shape-rounded": typeof ROUNDED.item
    "@matomezu/shape:shape-diamond": typeof DIAMOND.item
    "@matomezu/shape:shape-parallelogram": typeof PARALLELOGRAM.item
    "@matomezu/shape:shape-parallelogram-reversed": typeof PARALLELOGRAM_REVERSED.item
    "@matomezu/shape:shape-trapezoid": typeof TRAPEZOID.item
    "@matomezu/shape:shape-trapezoid-reversed": typeof TRAPEZOID_REVERSED.item
    "@matomezu/shape:shape-hexagon": typeof HEXAGON.item
    "@matomezu/shape:shape-circle": typeof CIRCLE.item
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface DialogTable {
    "@matomezu/shape:rounded-add": typeof ROUNDED.add
    "@matomezu/shape:diamond-add": typeof DIAMOND.add
    "@matomezu/shape:parallelogram-add": typeof PARALLELOGRAM.add
    "@matomezu/shape:parallelogram-reversed-add": typeof PARALLELOGRAM_REVERSED.add
    "@matomezu/shape:trapezoid-add": typeof TRAPEZOID.add
    "@matomezu/shape:trapezoid-reversed-add": typeof TRAPEZOID_REVERSED.add
    "@matomezu/shape:hexagon-add": typeof HEXAGON.add
    "@matomezu/shape:circle-add": typeof CIRCLE.add
    "@matomezu/shape:shape-edit": typeof SHAPE_EDIT_DIALOG
  }
}
