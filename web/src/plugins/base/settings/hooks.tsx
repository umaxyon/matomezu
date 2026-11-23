// 利用者の設定のフック
import { userNameOf } from "../../../core/settings"
import { useCatalog } from "../../../ui/store-context"
import { useSettings } from "../../../ui/view-hooks"

// 利用者名（設定カテゴリ「ユーザー設定」の項目。無ければ undefined で、出す側が「あなた」と出す）
export function useUserName(): string | undefined {
  const catalog = useCatalog().core
  return userNameOf(catalog, useSettings().values)
}
