// 利用者の設定のフック
import { NO_NAME } from "../../../core/entries"
import { userSetting } from "../../../core/settings"
import { useCatalog } from "../../../ui/store-context"
import { useSettings } from "../../../ui/view-hooks"
import { USER_NAME } from "./user-settings"

// 利用者名（設定カテゴリ「全体」の項目「ユーザー名」の、空でない値。無ければ NO_NAME で、出す側が「あなた」と出す）
export function useUserName(): string | typeof NO_NAME {
  const name = userSetting(useCatalog().core, useSettings().values, USER_NAME.id)
  return typeof name === "string" && name.trim() !== "" ? name.trim() : NO_NAME
}
