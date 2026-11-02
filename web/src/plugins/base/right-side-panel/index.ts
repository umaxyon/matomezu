// 右サイドパネル: 窓の右から出し、出た分だけステージの列を狭める入れ物。中身は、機能がスロットに置くウィジェット（幅はウィジェットの定義の rightSidePanel）。
// 開いたステージは窓いっぱいに広げ（分けていれば、もう片方の幅は 0）、閉じれば戻す。開け閉めの動きは入れ物が持ち、機能ごとに作らない
import { kit } from "../kit"
import { RIGHT_SIDE_PANEL } from "./slots"
import { panelIn, withPanel } from "./state"

// 開いている右サイドパネルを閉じる（Esc。右サイドパネルの中にフォーカスがあるとき）
export const RIGHT_SIDE_PANEL_CLOSE = kit.defineCommand({
  id: "right-side-panel-close",
  title: "Close the right side panel",
  run: (_ctx, a) => a.updateStageState(now => withPanel(now, null)),
  when: ctx => panelIn(ctx.stageState) !== null,
})

export const RIGHT_SIDE_PANEL_KEYS = [
  kit.defineKey({
    id: "right-side-panel-close-escape",
    key: "Escape",
    command: RIGHT_SIDE_PANEL_CLOSE.id,
    scope: RIGHT_SIDE_PANEL,
  }),
]
