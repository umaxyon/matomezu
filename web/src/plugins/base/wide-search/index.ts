// 横断検索: モードのプラグイン状態と、横断検索のタブを開閉するコマンドとキーを集める
import { kit } from "../kit"
import { LEFT_SIDE_PANEL_STATE, pressedLeftSidePanel, showsLeftSidePanel } from "../left-side-panel/state"
import { wideSearchEntries } from "./tab-id"

export { WIDE_SEARCH_MODE } from "./state"

declare module "../../../core/catalog" {
  interface ScreenExtras {
    wideSearchToggle?: true // このスクリーンで、横断検索のタブを開閉するコマンド（wide-search-toggle）を使える
  }
}

// 横断検索のタブを開閉する（Mod+Shift+F）。別のタブの組で開いていれば横断検索に置き換え、横断検索を開いていれば閉じる。
// タブはステージの物を見せないので、見せるステージは無い（null）。定義に wideSearchToggle を書いたスクリーンでだけ出す
export const WIDE_SEARCH_TOGGLE = kit.defineScreenCommand({
  id: "wide-search-toggle",
  title: "Wide search",
  run: (_ctx, a) =>
    a.updatePluginState(LEFT_SIDE_PANEL_STATE, now => pressedLeftSidePanel(now, wideSearchEntries, null)),
  when: ctx => ctx.catalog.screens.get(ctx.screen.def)?.wideSearchToggle === true,
  active: ctx => showsLeftSidePanel(ctx.pluginState(LEFT_SIDE_PANEL_STATE), wideSearchEntries, null),
})

// 横断検索の検索語のテキストFormの中のキー（テキストFormの中では、名乗った範囲のキーしか効かない。開くと焦点はここに来る）
export const WIDE_SEARCH_WORDS_KEY_SCOPE = kit.defineKeyScope({
  id: "wide-search-words",
  title: "Search words",
  commandsFrom: "screen",
})

// ブックスクリーンの Mod+Shift+F（ブック内を検索）はステージの範囲なので、ステージを並べないスクリーンでは、こちらが効く
export const WIDE_SEARCH_KEYS = [
  kit.defineKey({
    id: "wide-search-toggle-mod-shift-f",
    key: "Mod+Shift+F",
    command: WIDE_SEARCH_TOGGLE.id,
    scope: "screen",
  }),
  kit.defineKey({
    id: "wide-search-toggle-in-mod-shift-f",
    key: "Mod+Shift+F",
    command: WIDE_SEARCH_TOGGLE.id,
    scope: WIDE_SEARCH_WORDS_KEY_SCOPE.id,
  }),
]
