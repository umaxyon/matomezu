// 設定画面: 左に並べる設定カテゴリを置くスロット（設定カテゴリはそこに置くウィジェット。categories.tsx）と、設定画面を開くダイアログ・コマンド。
// 画面の中身はダイアログとは別の部品（SettingsScreen.tsx）で、ほかの置き場（ブックのビューなど）にもそのまま置ける
import { kit } from "../kit"

// 設定カテゴリのスロット（設定画面を開いたステージを渡す）
export const SETTINGS_CATEGORIES = kit.name("settings-categories")

// 設定カテゴリ「ユーザー設定」の中の節のスロット（ネットワーク設定など。節はそこに置くウィジェット。categories.tsx の defineSettingsSection）
export const SETTINGS_SECTIONS = kit.name("settings-sections")

// category は、開いたときに選んでおく設定カテゴリのウィジェットの id（無ければ先頭）
export const SETTINGS_DIALOG = kit.defineDialogWith<{ category?: string }>()({ id: "settings" })

export const SETTINGS_OPEN = kit.defineScreenCommand({
  id: "settings-open",
  title: "Open settings",
  run: (_ctx, a) => a.openDialog(SETTINGS_DIALOG.id, {}),
  when: () => true,
})
