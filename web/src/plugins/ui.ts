// 中の部品の一覧（画面のある app 用）。どのプラグインにも見た目を結んだもの
import { BASE_UI } from "./base/ui"
import { DRAWING_UI } from "./drawing/ui"

export const BUILTIN_UI = [BASE_UI, DRAWING_UI] as const
