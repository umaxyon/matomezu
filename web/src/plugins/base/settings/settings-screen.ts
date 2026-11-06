// 設定画面: 左に並べる項目を置くスロット（項目はそこに置くウィジェット。sections.tsx）と、設定画面を開くダイアログ・コマンド。
// 画面の中身はダイアログとは別の部品（SettingsScreen.tsx）で、ほかの置き場（ブックのビューなど）にもそのまま置ける
import { kit } from "../kit"

// 設定画面の項目のスロット（設定画面を開いたステージを渡す）
export const SETTINGS_SECTIONS = kit.name("settings-sections")

export const SETTINGS_DIALOG = kit.defineDialog({ id: "settings" })

export const SETTINGS_OPEN = kit.defineCommand({
  id: "settings-open",
  title: "Open settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, SETTINGS_DIALOG.id),
  when: () => true,
})
