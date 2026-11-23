// ネットワークのダイアログ
import { kit } from "./kit"

// 覚えたポートがほかに使われているとき、別のポートで開き直すかの確かめ（閉じたら、設定の「ネットワーク」に戻る）
export const PORT_REPICK_DIALOG = kit.defineDialog({ id: "port-repick" })
