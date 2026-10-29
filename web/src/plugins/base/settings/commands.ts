// 利用者の設定のコマンド: 項目の id → 値（null は既定に戻す）を変える（アクション settings-set）。ホームのタイプが許すときだけ出す
import { kit } from "../kit"
import { SETTINGS_SET } from "./actions"

export const SETTINGS_SET_COMMAND = kit.defineCommand({
  id: "settings-set",
  performs: [SETTINGS_SET.id],
  title: "Settings",
  run: (_ctx, a, values: Readonly<Record<string, unknown>>) => {
    a.perform(SETTINGS_SET.id, { values })
  },
  when: () => true,
})
