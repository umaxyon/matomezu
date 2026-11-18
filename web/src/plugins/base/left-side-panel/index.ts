// 左サイドパネル: 窓の左に出し、開く側が渡したタブの組を見せる入れ物（window/WindowView.tsx が描く）。上にタブの行を置き、タブは機能が defineLeftSidePanelTab で作るウィジェット。
// 開け閉めの動きは入れ物が持ち、機能ごとに作らない
import { kit } from "../kit"
import { LEFT_SIDE_PANEL } from "./slots"
import { LEFT_SIDE_PANEL_STATE } from "./state"

// 開いている左サイドパネルを閉じる（Esc。左サイドパネルの中にフォーカスがあるとき）
export const LEFT_SIDE_PANEL_CLOSE = kit.defineScreenCommand({
  id: "left-side-panel-close",
  title: "Close the left side panel",
  run: (_ctx, a) => a.updatePluginState(LEFT_SIDE_PANEL_STATE, () => undefined),
  when: ctx => ctx.pluginState(LEFT_SIDE_PANEL_STATE) !== undefined,
})

// 左サイドパネルの中にフォーカスがある間のキーの範囲（名前は LEFT_SIDE_PANEL と同じ）
export const LEFT_SIDE_PANEL_KEY_SCOPE = kit.defineKeyScope({ id: "left-side-panel", title: "Left side panel" })

export const LEFT_SIDE_PANEL_KEYS = [
  kit.defineKey({
    id: "left-side-panel-close-escape",
    key: "Escape",
    command: LEFT_SIDE_PANEL_CLOSE.id,
    scope: LEFT_SIDE_PANEL,
  }),
]
export { type LEFT_SIDE_PANEL_STATE, LEFT_SIDE_PANEL_STATES } from "./state"
