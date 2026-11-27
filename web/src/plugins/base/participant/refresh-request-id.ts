// リフレッシュリクエストのアクションの id（refresh-request。引継ぎ対象チケットのワーカーブックに引継ぎページを書いて頼む。作業の替わりの文と認可ステップ worker-book が名指す）
import { kit } from "../kit"

export const REFRESH_REQUEST_ID = kit.name("refresh-request")
