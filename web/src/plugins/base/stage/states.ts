// ステージのプラグイン状態の宣言: 背景編集モードで中身を隠しているか、印刷区画の区切りの線を隠しているか（どちらも隠しているときだけ true を持つ）
import { kit } from "../kit"

// 中身（ページの普通のアイテム）を隠しているか（背景編集モードの間だけ効く）
export const CONTENT_HIDDEN = kit.definePluginStateOf<boolean>()({ id: "content-hidden", scope: "stage" })

// 印刷区画の区切りの線を隠しているか（画面の中だけで、読み直すと見せる）
export const PRINT_AREAS_HIDDEN = kit.definePluginStateOf<boolean>()({ id: "print-areas-hidden", scope: "stage" })

export const STAGE_STATES = [CONTENT_HIDDEN, PRINT_AREAS_HIDDEN] as const
