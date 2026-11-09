// スライドのアイテムを描く間のキーの範囲と、置いたばかりの文字枠の文字の書き換えの名前
import { kit } from "./kit"

// スライドのレイヤーの根が名乗り、押した所がこの中なら、ここのキーが紙のキーより先に効く
export const SLIDE_KEY_SCOPE = kit.defineKeyScope({ id: "slide", title: "Slide" })

// 置いたばかりの文字枠の文字の書き換え（書き終えた変更は、置いた変更と画面の履歴の 1 段にまとめる）
export const ADDED_EDIT = kit.name("added-edit")
