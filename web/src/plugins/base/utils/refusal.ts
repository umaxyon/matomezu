// 断りの文言: アクションが断った結果を、利用者に伝える文言の鍵にする
import type { MessageKey } from "../../../core/catalog"
import type { CoreCatalog } from "../../../core/core-catalog"

// 許可の段が止めたならその段の名前、ほかの理由なら fallback（呼ぶ側がその操作で断られるわけを言う文言）
export function refusalMessage(
  catalog: CoreCatalog,
  done: { reason: string; permission?: string },
  fallback: MessageKey,
): MessageKey {
  const denied = done.reason === "denied" && done.permission ? catalog.permissions.get(done.permission) : undefined
  return denied ? denied.title : fallback
}
