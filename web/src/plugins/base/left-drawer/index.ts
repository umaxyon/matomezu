// 左ドロワー: ステージの左に被せて出す入れ物（ステージの列は狭めない）。上にタブの行を置き、タブは機能がスロットに置くウィジェット（名前はウィジェットの定義の leftDrawer）。
// 開け閉めの動きは入れ物が持ち、機能ごとに作らない
import { kit } from "../kit"
import { LEFT_DRAWER } from "./slots"
import { leftDrawerIn, withLeftDrawer } from "./state"

// 開いている左ドロワーを閉じる（Esc。左ドロワーの中にフォーカスがあるとき）
export const LEFT_DRAWER_CLOSE = kit.defineCommand({
  id: "left-drawer-close",
  title: "Close the left drawer",
  run: (_ctx, a) => a.updateStageState(now => withLeftDrawer(now, null)),
  when: ctx => leftDrawerIn(ctx.stageState) !== null,
})

export const LEFT_DRAWER_KEYS = [
  kit.defineKey({ id: "left-drawer-close-escape", key: "Escape", command: LEFT_DRAWER_CLOSE.id, scope: LEFT_DRAWER }),
]
