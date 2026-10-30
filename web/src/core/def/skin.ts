// スキンの定義: アプリの枠（上の行・タブ・ダイアログ・ステージの地）の見た目。利用者の設定で選び、ブックの中身（テーマ）には効かない。
// どのスキンも土台が決めたスキンキー（SkinToken）の値を全部埋める（抜けると型の誤り）。スキンキーは CSS 変数 --skin-<スキンキー> になり、ウィジェットはこのスキンキーだけで色を付ける
import type { SkinExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export const SKIN_TOKENS = [
  // 面
  "stage", // ステージの地（紙の外）
  "stage-grid", // ステージの地の点
  "surface", // 下の行の地（ステージの下に付いた面）
  "surface-muted", // 入力Formの地
  "surface-strong", // ブック名のボタンの地
  "surface-raised", // 浮かぶ面の地: ドロワー・メニュー・ダイアログ・トースト・画面の上に浮かぶ丸いボタン（道具のアイコン）
  // 影（box-shadow の値）
  "shadow-1", // 下の行・ドロワーの縁の薄い影
  "shadow-2", // 浮かぶボタン・ミニマップ・道具箱・名前の札
  "shadow-3", // メニュー・トースト・ダイアログ・色のポップアップ
  // 線
  "border",
  "border-strong", // 入力Formの縁
  // 文字
  "text",
  "text-muted",
  "text-disabled", // 押せない物の文字とアイコン
  // 操作
  "btn",
  "btn-hover",
  // 強調
  "accent",
  "accent-subtle", // 強調の色を薄く敷いた地（分けているときのカレントのステージの下の行・浮かぶボタンに乗せたとき）
  "on-accent", // 強調の色の地の上の文字とアイコン
  // 状態
  "danger", // 取り消せない操作（消すなど）のボタンの文字と縁。失敗を知らせるトーストの印
  "warn", // 断りを知らせるトーストの印
  "info", // お知らせのトーストの印
  "success", // うまくいったことを知らせる印
  "font",
] as const

export type SkinToken = (typeof SKIN_TOKENS)[number]
export type Scheme = "light" | "dark"

export interface SkinDef extends SkinExtras {
  id: string
  title: MessageKey
  scheme: Scheme // 入力Formやスクロールバーの明暗。自動のスキンは、OS の明暗と同じ明暗のスキンから選ぶ
  tokens: Readonly<Record<SkinToken, string>>
}

export function defineSkin<const T extends SkinDef>(def: T): T {
  return def
}
