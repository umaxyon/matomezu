// 設定画面: 左に並べる設定カテゴリを置くスロット（設定カテゴリはそこに置くウィジェット。categories.tsx）と、設定画面を開くダイアログ・コマンド。
// 画面の中身はダイアログとは別の部品（SettingsScreen.tsx）で、ほかの置き場（ブックのビューなど）にもそのまま置ける
import { kit } from "../kit"

// 設定カテゴリのスロット（設定画面を開いたステージを渡す）
export const SETTINGS_CATEGORIES = kit.name("settings-categories")

export const SETTINGS_DIALOG = kit.defineDialog({ id: "settings" })

export const SETTINGS_OPEN = kit.defineCommand({
  id: "settings-open",
  title: "Open settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, SETTINGS_DIALOG.id),
  when: () => true,
})
