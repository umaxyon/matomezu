// 設定画面: 左に並べる項目（全体・キーバインド。画面ではショートカットキー）と、それを開くダイアログ・コマンド。画面の中身はダイアログとは別の部品（SettingsScreen.tsx）で、
// ほかの置き場（ブックのビューなど）にもそのまま置ける
import type { MessageKey } from "../../../core/i18n/i18n"
import { kit } from "../kit"

// 設定画面の項目 1 つ: id と、左の一覧に出す題名
export interface SettingsSection {
  id: string
  title: MessageKey
}

export const SETTINGS_SECTIONS = [
  { id: "general", title: kit.message("General") },
  { id: "keys", title: kit.message("Shortcut keys") },
] as const satisfies readonly SettingsSection[]

// 設定画面の項目の id
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

export const SETTINGS_DIALOG = kit.defineDialog({ id: "settings" })

export const SETTINGS_OPEN = kit.defineCommand({
  id: "settings-open",
  title: "Open settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, SETTINGS_DIALOG.id),
  when: () => true,
})
