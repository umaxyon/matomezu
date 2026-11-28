// 断りの文言: アクションが断った結果を、利用者に伝える文言の鍵にする
import type { MessageKey } from "../../../core/catalog"
import type { CoreCatalog } from "../../../core/core-catalog"
import { TITLE_TAKEN } from "../../../core/entries"

// 認可ステップが止めたならそのステップの名前、ほかの理由なら fallback（呼ぶ側がその操作で断られるわけを言う文言）
export function refusalMessage(
  catalog: CoreCatalog,
  done: { reason: string; permission?: string | symbol },
  fallback: MessageKey,
): MessageKey {
  const denied =
    done.reason === "denied" && typeof done.permission === "string"
      ? catalog.permissions.get(done.permission)
      : undefined
  return denied ? denied.title : fallback
}

// 同じフォルダの中に同じ名前の物が在って、断られたか
export const titleTaken = (done: { ok: boolean; kind?: string | symbol }): boolean =>
  !done.ok && done.kind === TITLE_TAKEN
