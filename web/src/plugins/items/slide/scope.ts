// 描画シェイプを描く間のキーの範囲と、文字枠の書き換えのキーの範囲と、文字枠の文字の書き換えの名前
import { kit } from "./kit"

// スライドのレイヤーの根が名乗り、押した所がこの中なら、ここのキーが紙のキーより先に効く
export const SLIDE_KEY_SCOPE = kit.defineKeyScope({ id: "slide", title: "Slide", commandsFrom: "stage" })

// 文字枠の文字を書き換えるテキストForm が名乗る範囲（取り消しの Escape をここに置く）
export const SLIDE_TEXT_KEY_SCOPE = kit.defineKeyScope({
  id: "in-place",
  title: "Slide text editing in place",
  commandsFrom: "stage",
})

// 文字枠の文字の書き換え（ステージの editing）
export const TEXT_EDIT = kit.name("text-edit")

// 置いたばかりの文字枠の文字の書き換え（書き終えた変更は、置いた変更と画面の履歴の 1 段にまとめる）
export const ADDED_EDIT = kit.name("added-edit")

// 描画シェイプの右クリックのメニュー（引数は右クリックしたアイテムの id）
export const SLIDE_ITEM_CONTEXT = kit.name("item-context")
