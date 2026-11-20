// 起動エラーの画面に出す物（画面の入口がインスタンスに渡したもの）を、見た目から読むフック
import { fail } from "../../../core/errors"
import type { StartupError } from "../../../store/state"
import { useInstance } from "../../../ui/store-context"

// 起動を止めた窓のほかで描けば E214
export function useStartupError(widget: string): StartupError {
  return useInstance().startupError ?? fail("E214", { widget })
}
