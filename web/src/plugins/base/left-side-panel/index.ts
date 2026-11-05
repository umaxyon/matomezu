// 左サイドパネル: 窓の左に出し、開いている間は開いたステージを窓いっぱいに広げる入れ物（閉じれば戻す）。上にタブの行を置き、タブは機能がスロットに置くウィジェット（名前はウィジェットの定義の leftSidePanel）。
// 開け閉めの動きは入れ物が持ち、機能ごとに作らない
import { kit } from "../kit"
import { LEFT_SIDE_PANEL } from "./slots"
import { leftSidePanelIn, withLeftSidePanel } from "./state"

// 開いている左サイドパネルを閉じる（Esc。左サイドパネルの中にフォーカスがあるとき）
export const LEFT_SIDE_PANEL_CLOSE = kit.defineCommand({
  id: "left-side-panel-close",
  title: "Close the left side panel",
  run: (_ctx, a) => a.updateStageState(now => withLeftSidePanel(now, null)),
  when: ctx => leftSidePanelIn(ctx.stageState) !== null,
})

// 左サイドパネルの中にフォーカスがある間のキーの範囲（名前はスロットと同じ）
export const LEFT_SIDE_PANEL_KEY_SCOPE = kit.defineKeyScope({ id: "left-side-panel", title: "Left side panel" })

export const LEFT_SIDE_PANEL_KEYS = [
  kit.defineKey({
    id: "left-side-panel-close-escape",
    key: "Escape",
    command: LEFT_SIDE_PANEL_CLOSE.id,
    scope: LEFT_SIDE_PANEL,
  }),
]
