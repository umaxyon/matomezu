// 読めない物が読めない訳の短い言葉（読めない物のフォルダの一覧と、移ったときの知らせが共に使う）
import type { MovedCode } from "../../../core/folders"
import { splitId } from "../../../core/names"
import type { Plugin } from "../../../store/plugin"
import { useMessages } from "../../../ui/i18n"
import { useInstance } from "../../../ui/store-context"
import { useUserSetting } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { addedPluginsOf, ENABLED_PLUGINS, pluginLabel } from "../settings/enabled-plugins"
import { NO_TYPE } from "./outline"

// 読めない訳: 形が合わない（W005・W028）・決まりに合わない（W006・W029）・タイプのプラグインが無効（入れてあるが有効でない）・無い（入っていない。持ち主の分からないタイプも）（W027）
export type Reason =
  | { word: "shape" }
  | { word: "rules" }
  | { word: "disabled"; plugin: Pick<Plugin, "id" | "title"> }
  | { word: "absent"; plugin: string | typeof NO_OWNER }
export const NO_OWNER = "none"

// 訳の番号 code と無いタイプ type（無ければ NO_TYPE）の読めない訳。added は入れた追加プラグイン、enabled は有効の設定の値
export function reasonOf(
  code: MovedCode,
  type: string,
  added: readonly Pick<Plugin, "id" | "title">[],
  enabled: readonly string[],
): Reason {
  if (code === "W005" || code === "W028") return { word: "shape" }
  if (code === "W006" || code === "W029") return { word: "rules" }
  const owner = type === NO_TYPE ? null : splitId(type).owner
  if (owner === null) return { word: "absent", plugin: NO_OWNER }
  const plugin = added.find(p => p.id === owner)
  return plugin && !enabled.includes(owner) ? { word: "disabled", plugin } : { word: "absent", plugin: owner }
}

// 読めない訳の言葉を引く関数（今の入れた追加プラグインと有効の設定で決める）
export function useReasonOf(): (code: MovedCode, type: string) => string {
  const t = useMessages(kit)
  const added = addedPluginsOf(useInstance().plugins)
  const enabled = useUserSetting(ENABLED_PLUGINS.id) as readonly string[]
  return (code, type) => {
    const reason = reasonOf(code, type, added, enabled)
    if (reason.word === "shape") return t("Its shape does not fit")
    if (reason.word === "rules") return t("It breaks the rules")
    if (reason.word === "disabled")
      return t("The plugin is disabled: {plugin}", { plugin: pluginLabel(reason.plugin, t) })
    return reason.plugin === NO_OWNER ? t("No plugin for it") : t("No plugin: {plugin}", { plugin: reason.plugin })
  }
}
