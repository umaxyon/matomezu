// 書庫のスクリーンのキーバインド: 書庫の画面の中の Esc で、書庫のスクリーンを閉じる（コントロールセンターの書庫の画面では、コマンドが出ないので効かない）
import { kit } from "../kit"
import { LIBRARY_SCOPE } from "./commands"
import { LIBRARY_SCREEN_CLOSE } from "./screen"

export const LIBRARY_SCREEN_KEYS = [
  kit.defineKey({
    id: "library-screen-close-escape",
    key: "Escape",
    command: LIBRARY_SCREEN_CLOSE.id,
    scope: LIBRARY_SCOPE,
  }),
]
