// 開いているスクリーンの、base のプラグイン状態での持ち方（窓に 1 つ）: 開いているスクリーンのウィジェットの id と、そのビューに渡す物（データだけ）。
// 画面の場所（URL）に入れ、変わるたびにブラウザの履歴に積む（戻るで閉じる）。入れ物は渡された物の中身を読まない
import { z } from "zod"
import { kit } from "../kit"

export interface OpenedScreen {
  screen: string
  props?: unknown
}

export const OPEN_SCREEN_STATE = kit.definePluginState({
  id: "open-screen",
  scope: "window",
  schema: z.strictObject({ screen: z.string().min(1), props: z.unknown() }),
  address: "push",
})

export const SCREEN_STATES = [OPEN_SCREEN_STATE] as const
