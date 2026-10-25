// 追加プラグインが借りる、名前から実物を引く表（ホストのエンジン用。React なし）: キーは追加プラグインが import に書く名前、値は動いている matomezu の実物。
// ホストは追加プラグインを変換するとき、表にある名前を取り込まず、この表から取り出す形にする（zod などが 2 つになると動かないため）
import * as matomezu from "../plugin-api"

export const MODULES = {
  matomezu,
} satisfies Record<string, object>

// 画面用の表（ui.ts）の名前。ホストは見た目の JS を変換するとき、この名前を取り込まない（ホストのエンジンは React を持たないので、名前だけをここに置く）
export const UI_NAMES = ["matomezu", "matomezu/ui", "react", "react/jsx-runtime"] as const
