// ネットワークのダイアログ
import { kit } from "./kit"

// 覚えたポートがほかに使われているとき、別のポートで開き直すかの確かめ（閉じたら、設定の「ネットワーク」に戻る）
export const PORT_REPICK_DIALOG = kit.defineDialog({ id: "port-repick" })

// ホストをつなぐ（このホストからペアリングを頼む）: 見つかったホストか、手で入れた待っている所を選び、接続確認コードを見せて相手の答えを待つ
export const PAIRING_DIALOG = kit.defineDialog({ id: "pairing" })

// ほかのホストから届いたペアリングの頼み（しおりから開く）: 頼み request（レコードの id）の中身と接続確認コード、断る・受け入れる
export const PAIRING_REQUEST_DIALOG = kit.defineDialogWith<{ request: string }>()({ id: "pairing-request" })

// ペアリングを解く確かめ（詳しい所の右下のアイコンから開く）: ペアリングしたホスト pairedHost（レコードの id）
export const UNPAIR_DIALOG = kit.defineDialogWith<{ pairedHost: string }>()({ id: "unpair" })
