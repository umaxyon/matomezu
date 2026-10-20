// 型を書き足す口（画面の入口の分。空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。コマンドとダイアログを足すプラグインは、id と定義の型（typeof 定義）をここに declare module で書き足す。
// 定義の分は core/tables.ts
export interface CommandTable {}
export interface DialogTable {}

export type CommandId = keyof CommandTable & string
export type DialogId = keyof DialogTable & string
