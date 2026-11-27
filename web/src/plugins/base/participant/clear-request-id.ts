// 会話を空にする頼みのアクションの id（clear-request。離れた作業の引き継ぎを書いて頼む。作業の替わりの文と認可ステップ worker-book が名指す）
import { kit } from "../kit"

export const CLEAR_REQUEST_ID = kit.name("clear-request")
