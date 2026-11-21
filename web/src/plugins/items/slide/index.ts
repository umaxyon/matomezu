// スライドのプラグイン: スライドに描くアイテムと、置く・動かす・大きさを変える・項目を変える・重ねを変える・消すアクション。
// 置き場はページの slide で、ページのタイプが選ぶ（タイプの slide.allowed）。描いて操作を受けるレイヤー（book-layers）と、そのコマンドとキーも持つ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { SLIDE_MOVE, SLIDE_PLACE, SLIDE_REMOVE, SLIDE_REORDER, SLIDE_RESIZE, SLIDE_UPDATE } from "./actions"
import {
  SLIDE_BACKWARD,
  SLIDE_DELETE,
  SLIDE_FORWARD,
  SLIDE_KEYS,
  SLIDE_MOVE_TO,
  SLIDE_PUT,
  SLIDE_RESHAPE,
  SLIDE_SET,
  SLIDE_TEXT_CANCEL,
  SLIDE_TO_BACK,
  SLIDE_TO_FRONT,
} from "./commands"
import { kit } from "./kit"
import { SLIDE_KEY_SCOPE, SLIDE_TEXT_KEY_SCOPE } from "./scope"
import {
  type ELLIPSE,
  type FREE_LINE,
  type RECTANGLE,
  SLIDE_INK,
  SLIDE_ITEMS,
  type STRAIGHT_LINE,
  type TEXT_FRAME,
} from "./slide"

export const SLIDE_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [...SLIDE_ITEMS],
    tokens: [SLIDE_INK],
    actions: [SLIDE_PLACE, SLIDE_MOVE, SLIDE_RESIZE, SLIDE_UPDATE, SLIDE_REORDER, SLIDE_REMOVE],
    commands: [
      SLIDE_PUT,
      SLIDE_MOVE_TO,
      SLIDE_RESHAPE,
      SLIDE_SET,
      SLIDE_DELETE,
      SLIDE_TEXT_CANCEL,
      SLIDE_TO_FRONT,
      SLIDE_FORWARD,
      SLIDE_BACKWARD,
      SLIDE_TO_BACK,
    ],
    keys: SLIDE_KEYS,
    keyScopes: [SLIDE_KEY_SCOPE, SLIDE_TEXT_KEY_SCOPE],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/slide:slide-text": typeof TEXT_FRAME
    "@matomezu/slide:slide-free-line": typeof FREE_LINE
    "@matomezu/slide:slide-line": typeof STRAIGHT_LINE
    "@matomezu/slide:slide-ellipse": typeof ELLIPSE
    "@matomezu/slide:slide-rectangle": typeof RECTANGLE
  }
  interface ActionTable {
    "@matomezu/slide:slide-place": typeof SLIDE_PLACE
    "@matomezu/slide:slide-move": typeof SLIDE_MOVE
    "@matomezu/slide:slide-resize": typeof SLIDE_RESIZE
    "@matomezu/slide:slide-update": typeof SLIDE_UPDATE
    "@matomezu/slide:slide-reorder": typeof SLIDE_REORDER
    "@matomezu/slide:slide-remove": typeof SLIDE_REMOVE
  }
  interface CommandTable {
    "@matomezu/slide:slide-put": typeof SLIDE_PUT
    "@matomezu/slide:slide-move-to": typeof SLIDE_MOVE_TO
    "@matomezu/slide:slide-reshape": typeof SLIDE_RESHAPE
    "@matomezu/slide:slide-set": typeof SLIDE_SET
    "@matomezu/slide:slide-delete": typeof SLIDE_DELETE
    "@matomezu/slide:slide-text-cancel": typeof SLIDE_TEXT_CANCEL
    "@matomezu/slide:slide-to-front": typeof SLIDE_TO_FRONT
    "@matomezu/slide:slide-forward": typeof SLIDE_FORWARD
    "@matomezu/slide:slide-backward": typeof SLIDE_BACKWARD
    "@matomezu/slide:slide-to-back": typeof SLIDE_TO_BACK
  }
  interface KeyScopeTable {
    "@matomezu/slide:slide": typeof SLIDE_KEY_SCOPE // スライドのレイヤーで操作している間のキー
    "@matomezu/slide:in-place": typeof SLIDE_TEXT_KEY_SCOPE // 文字枠の文字を書き換えている間のキー
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
