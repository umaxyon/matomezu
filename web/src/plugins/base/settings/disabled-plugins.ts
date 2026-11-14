// 画面に置かない追加プラグインの利用者の設定の項目: 無効にしたプラグインの id の並び。無効のプラグインのウィジェットとコマンドを、画面の UI マッピングに置かない
// （プラグインは取り外さず、設定に残るので、有効に戻せばまた置かれる。ビルトインプラグインは無効にできない。土台は role で読む: core/settings.ts の disabledPluginsOf）
import { z } from "zod"
import { kit } from "../kit"

export const DISABLED_PLUGINS = kit.defineSetting({
  id: "disabled-plugins",
  title: "Enabled plugins",
  schema: z.array(z.string()),
  default: [],
  role: "disabled-plugins",
  userOnly: true, // 利用者だけが変える（AI に変えさせず、AI が読む設定にも出さない。画面に置くかは利用者が決める）
})

// プラグイン id を有効・無効にした設定の値（ほかの無効の id と並びはそのまま。有効にすれば外し、無効にすれば末尾に足す）
export function withPluginEnabled(disabled: readonly string[], id: string, enabled: boolean): readonly string[] {
  const rest = disabled.filter(d => d !== id)
  return enabled ? rest : [...rest, id]
}
