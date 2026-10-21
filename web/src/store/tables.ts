// 型を書き足す口（画面の入口の分。空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。コマンドとダイアログを足すプラグインは、id と定義の型（typeof 定義）をここに declare module で書き足す。
// 定義の分は core/tables.ts
export interface CommandTable {}
export interface DialogTable {}

// キーの範囲（割り当てが効く所）→ true。土台は app（アプリ全体）・stage（カレントのステージ）・dialog・menu（開いているメニュー: 右クリックのメニューと道具のアイコン）。
// プラグインは自分の id を頭に付けた範囲を書き足し、自分のウィジェットの要素に data-key-scope で名乗らせる
export interface KeyScopeTable {
  app: true
  stage: true
  dialog: true
  menu: true
}

export type CommandId = keyof CommandTable & string
export type KeyScopeId = keyof KeyScopeTable & string
export type DialogId = keyof DialogTable & string
