// プロジェクトの一覧（コントロールセンターの左の列）の画面の状態（窓の中だけ）
import { kit } from "../kit"

// プロジェクトの一覧を開いているか（最初は閉じている）
export const LIST_OPEN = kit.definePluginStateOf<boolean>()({ id: "list-open", scope: "window", default: false })
