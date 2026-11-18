// スクリーンの定義: 窓が見せる画面 1 枚の種類。窓はスクリーンを何枚でも開け、同じ定義・同じ渡す値でも別の 1 枚として開ける（core/window.ts）。
// 開くときに渡す値（props）は、ビューが受け取るデータで、画面の場所（URL）にも入るので、形（zod）を持つ。描き方はプラグインの見た目で結ぶ。
// stages を名乗るスクリーンは、ステージを並べる（ブックスクリーン）。土台が、開いた 1 枚ごとにステージの並び（core/workspace.ts）を持つ
import type { z } from "zod"
import type { LibraryAppearanceId, ScreenExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"
import type { PluginStateRead } from "./plugin-state"

export interface ScreenDef<P extends z.ZodObject = z.ZodObject, Tt extends string = MessageKey> extends ScreenExtras {
  id: string // 本当の id（例: @matomezu/taskboard:ticket-screen）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。何を見せるスクリーンで、渡す値が何か）
  props: P // 開くときに渡す値の形（渡す値の無いスクリーンは、空のオブジェクトの形）
  stages?: true // ステージを並べるスクリーン
  atStart?: true // 窓を開いたときから開いているスクリーン（閉じられない）
  // このスクリーンが見せることのある書庫アピアランス（定義の id）
  libraryAppearances?: readonly LibraryAppearanceId[]
  // libraryAppearances のうち、今見せている物の id（描いたまま隠している物は含めない）。read は、聞かれたスクリーンの、持ち主のプラグイン状態を読む
  // （ほかのプラグインの宣言は E125）。無ければ、libraryAppearances を全部、いつも見せている
  shownLibraryAppearances?(read: PluginStateRead): readonly string[]
  maxOpen?: number // 開いたままにする枚数（1 以上。超えた分は、土台がカレントにしたのが古い物から閉じる。無ければ何枚でも）
}
