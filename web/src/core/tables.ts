// 型を書き足す口（空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。定義・コマンド・ダイアログ・ウィジェットなどを足すプラグインは、自分の足す id と定義の型（typeof 定義）を、ここに declare module で書き足す。
// 中の部品も外のプラグインも同じ口を使う（外からは matomezu/tables の名前で、このファイルを指す）。ここから id の型・ブックの型・アクションの引数の型などが決まる。
// 書き足しは、このファイルに向ける。このファイルを読み直して出す別のファイルに向けると、ほかの書き足しと合わさらない。
// 書き足した id と、app に渡した定義の id がそろっているかは、組み立て（createMatomezu）が型で確かめる
export interface BookTypeTable {}
export interface ItemTable {}
export interface ActionTable {}
export interface ThemeTable {}
export interface PaperTable {}
export interface SkinTable {}
export interface SettingTable {}
export interface PresentationTable {}
export interface MessageTable {} // 文言の鍵 → 訳
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

// 画面の配置の分。スロットは「id → そこに置くウィジェットが受け取る値」。スロットを描くウィジェットを持つプラグインが、そのスロットを書き足す
export interface SlotTable {
  app: Record<string, never> // 画面の根（土台が描く、ただ 1 つのスロット）
}
export interface WidgetTable {}
export interface MenuTable {} // メニューの id → true
// 右クリックのメニューの id → 受け取る物（右クリックされた物。項目のコマンドに引数として渡す。何も受け取らなければ Record<string, never>）
export interface ContextMenuTable {}

export type BookTypeId = keyof BookTypeTable & string
// 1 冊だけのタイプの id（そのブックの id でもある）
export type SingleBookTypeId = { [K in BookTypeId]: BookTypeTable[K] extends { single: true } ? K : never }[BookTypeId]
export type ItemId = keyof ItemTable & string
export type ActionId = keyof ActionTable & string
export type ThemeId = keyof ThemeTable & string
export type PaperId = keyof PaperTable & string
export type SkinId = keyof SkinTable & string
export type SettingId = keyof SettingTable & string
export type PresentationId = keyof PresentationTable & string
export type MessageKey = keyof MessageTable & string
export type CommandId = keyof CommandTable & string
export type KeyScopeId = keyof KeyScopeTable & string
export type DialogId = keyof DialogTable & string
export type SlotId = keyof SlotTable & string
export type WidgetId = keyof WidgetTable & string
export type MenuId = keyof MenuTable & string
export type ContextMenuId = keyof ContextMenuTable & string
export type SlotProps<S extends SlotId> = SlotTable[S]
