// 追加プラグインの有効の利用者の設定の項目: 有効にしたプラグインの id の並び。追加プラグインは、足したときは無効で（この並びに無い）、利用者が設定で有効にする。
// 無効のプラグインのウィジェットとコマンドは、画面の UI マッピングに置かない（プラグインは取り外さず、設定に残る。ビルトインプラグインは並びに関わらず有効。
// 土台は role で読む: core/settings.ts の disabledPluginsOf）
import { z } from "zod"
import { kit } from "../kit"

export const ENABLED_PLUGINS = kit.defineSetting({
  id: "enabled-plugins",
  title: "Enabled plugins",
  schema: z.array(z.string()),
  default: [],
  role: "enabled-plugins",
  userOnly: true, // 利用者だけが変える（AI に変えさせず、AI が読む設定にも出さない。画面に置くかは利用者が決める）
})

// プラグイン id を有効・無効にした設定の値（有効にすれば末尾に足し、無効にすれば外す。重ねて足さない）
export function withPluginEnabled(enabled: readonly string[], id: string, on: boolean): readonly string[] {
  const rest = enabled.filter(e => e !== id)
  return on ? [...rest, id] : rest
}
