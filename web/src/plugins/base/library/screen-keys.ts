// 書庫のスクリーンのキーバインド: 書庫のスクリーンの中の Esc で、書庫のスクリーンを閉じる（キーの範囲 library-screen。書庫のスクリーンの根が名乗る）。
// 選ぶ形の間は、書庫の画面の中の Esc が先に選ぶ形をやめる（キーの範囲 library。選ぶ形でなければ、使えないので書庫のスクリーンの範囲へ落ちる。
// コントロールセンターの書庫の画面には書庫のスクリーンの範囲が無いので、選ぶ形の外の Esc は何もしない）
import { kit } from "../kit"
import { LIBRARY_SCOPE } from "./commands"
import { LIBRARY_CHOOSE_CANCEL, LIBRARY_SCREEN_CLOSE } from "./screen"

export const LIBRARY_SCREEN_SCOPE = kit.name("library-screen")
export const LIBRARY_SCREEN_KEY_SCOPE = kit.defineKeyScope({
  id: "library-screen",
  title: "Library screen",
  commandsFrom: "screen",
})

export const LIBRARY_SCREEN_KEYS = [
  kit.defineKey({
    id: "library-choose-cancel-escape",
    key: "Escape",
    command: LIBRARY_CHOOSE_CANCEL.id,
    scope: LIBRARY_SCOPE,
  }),
  kit.defineKey({
    id: "library-screen-close-escape",
    key: "Escape",
    command: LIBRARY_SCREEN_CLOSE.id,
    scope: LIBRARY_SCREEN_SCOPE,
  }),
]
