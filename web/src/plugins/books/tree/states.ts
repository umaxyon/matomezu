// ツリーのプラグイン状態: 節のフォーカス（選んでいる節を中央に置き、そのほかを暗くする）を外してあるか。
// 背景編集モードの間はビューが別の位置に描き直されるので、ビューの外（ステージごとのプラグイン状態）に持つ
import { kit } from "./kit"

export const TREE_FOCUS_RELEASED_STATE = kit.definePluginStateOf<boolean>()({ id: "focus-released", scope: "stage" })

export const TREE_STATES = [TREE_FOCUS_RELEASED_STATE] as const
