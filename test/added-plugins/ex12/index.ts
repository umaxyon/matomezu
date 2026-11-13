// ex12: スクリーンアレンジメント（defineScreenArrangement）を足す追加プラグインの見本。開いているスクリーンを全部、縦に並べて見せる（入りきらなければスクロール）。
// スクリーンごとの高さは、スクリーンの範囲のプラグイン状態で持つ（そのスクリーンを閉じると消え、画面の場所にも入る）。下の行は出さない。
// 自分のスクリーンの定義（defineScreen。渡す値はラベル）も 1 つ持ち、同じ定義から何枚でも開く
import { definePlugin, z } from "matomezu"
import { kit } from "./kit"

// 開いているスクリーンを全部見せる（カレントスクリーンは、押した 1 枚）
export const EX12_STACK = kit.defineScreenArrangement({
  id: "stack",
  title: "stack",
  aiDescription:
    "Shows every opened screen, stacked from the top, each with its own height (scrolls when they do not fit).",
  shown: screens => screens.map(s => s.id),
})

// スクリーン 1 枚の高さ（px。無ければ既定の高さ）
export const EX12_HEIGHT = kit.definePluginState({
  id: "height",
  scope: "screen",
  schema: z.number().int().min(80).max(2000),
  address: "replace",
})

export const EX12_DEFAULT_HEIGHT = 240

// ラベルを見せるだけのスクリーン
export const EX12_PANEL = kit.defineScreen({
  id: "panel",
  title: "panel",
  aiDescription: "A panel that shows its label.",
  props: z.strictObject({ label: z.string().min(1) }),
})

export const EX12 = definePlugin(
  kit.plugin({ screenArrangements: [EX12_STACK], screens: [EX12_PANEL], pluginStates: [EX12_HEIGHT] }),
)

export default EX12

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface ScreenArrangementTable {
    "ex12:stack": typeof EX12_STACK
  }
  interface ScreenTable {
    "ex12:panel": typeof EX12_PANEL
  }
  interface PluginStateTable {
    "ex12:height": typeof EX12_HEIGHT
  }
}
