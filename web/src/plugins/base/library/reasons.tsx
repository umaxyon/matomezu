// 読めない物が読めない訳の短い言葉（読めない物のフォルダの一覧と、移ったときの知らせが共に使う）
import type { MovedCode } from "../../../core/folders"
import { splitId } from "../../../core/names"
import { isBuiltin } from "../../../store/plugin"
import { useMessages } from "../../../ui/i18n"
import { useInstance } from "../../../ui/store-context"
import { useUserSetting } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { ENABLED_PLUGINS } from "../settings/enabled-plugins"
import { NO_TYPE } from "./outline"

// 訳の番号 code と無いタイプ type（無ければ NO_TYPE）の言葉: タイプのプラグインが無効（入れてあるが有効でない。名前）・無い（id）（W027）、形が合わない（W005・W028）、決まりに合わない（W006・W029）
export function useReasonOf(): (code: MovedCode, type: string) => string {
  const t = useMessages(kit)
  const added = useInstance().plugins.filter(p => !isBuiltin(p))
  const enabled = useUserSetting(ENABLED_PLUGINS.id) as readonly string[]
  return (code, type) => {
    if (code === "W005" || code === "W028") return t("Its shape does not fit")
    if (code === "W006" || code === "W029") return t("It breaks the rules")
    const owner = type === NO_TYPE ? null : splitId(type).owner
    if (owner === null) return t("No plugin for it")
    const plugin = added.find(p => p.id === owner)
    return plugin && !enabled.includes(owner)
      ? t("The plugin is disabled: {plugin}", { plugin: plugin.title ? t(plugin.title) : owner })
      : t("No plugin: {plugin}", { plugin: owner })
  }
}
