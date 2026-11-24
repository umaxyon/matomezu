// スクリーンアレンジメントの定義: 窓の、開いているスクリーンの見せ方（どれを・どこに・どの大きさで）。窓は、スクリーンアレンジメントを 1 つ持つ。
// 見えているスクリーン（描いているスクリーン。スクロールで画面の外にある物も含む）は、shown が、開いているスクリーンとカレントにした順と、アレンジメントの値だけから答える
// （画面を描かずに決まる。ホストと AI も、同じ関数で知る）。描き方は、プラグインの見た目で結ぶ（定義の id と同じ名前のスロットに置いたウィジェット）。
// アレンジメントの値（value）は、見えているスクリーンを決めるのに要る物（分けて並べるスクリーンの並びなど）。窓が持ち、画面の場所にも入る。土台は中身を読まない。
// 描き方にだけ使う値（スクリーンごとの高さなど）は、プラグイン状態（スクリーンの範囲）で持つ
import type { z } from "zod"
import type { ScreenArrangementExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"
import type { OpenedScreen } from "../window"

export interface ScreenArrangementDef<Tt extends string = MessageKey, V = unknown> extends ScreenArrangementExtras {
  id: string // 本当の id（例: @matomezu/base:one-screen）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。スクリーンをどう見せるか）
  // アレンジメントの値の形と、替えたときの初めの値（無ければ、値を持たない。そのときの値は NO_ARRANGEMENT_VALUE）
  value?: { schema: z.ZodType<V>; initial: V }
  // 見えているスクリーンの id。screens は開いているスクリーン（開いた順）、order はその id をカレントにした順（最後がカレントスクリーン）、value はアレンジメントの値
  shown(screens: readonly OpenedScreen[], order: readonly string[], value: V): readonly string[]
  atStart?: true // 窓を開いたときのスクリーンアレンジメント（機能台帳で 1 つだけが名乗る）
  // 窓に開いておくスクリーンの枚数（1 以上。窓を開いたときから開いているスクリーンは数えない。超えた分は、土台が見えていない物のうちカレントにしたのが古い物から閉じる。無ければ何枚でも）
  maxScreens?: number
}

// 値を持たないスクリーンアレンジメントの値
export const NO_ARRANGEMENT_VALUE: Readonly<Record<string, never>> = Object.freeze({})

// 定義 def の、値 value を確かめた物（合わなければ、定義の初めの値。値を持たない定義なら NO_ARRANGEMENT_VALUE）
export function arrangementValueOf(def: ScreenArrangementDef, value: unknown): unknown {
  if (!def.value) return NO_ARRANGEMENT_VALUE
  const fits = def.value.schema.safeParse(value)
  return fits.success ? fits.data : def.value.initial
}
