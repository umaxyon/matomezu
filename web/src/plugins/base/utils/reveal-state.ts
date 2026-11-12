// 物を見せてという頼みの、base のステージごとのプラグイン状態 revealing: 見せたい物の id（頼みが無ければ無い）
import { kit } from "../kit"

export const REVEALING_STATE = kit.definePluginStateOf<readonly string[]>()({ id: "revealing", scope: "stage" })

export const REVEAL_REQUEST_STATES = [REVEALING_STATE] as const
