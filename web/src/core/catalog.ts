import type { ConnectorData, ShapeData } from "./def/item"

// 定義の種類ごとの id と定義の型を、プラグインが書き足す所（空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。定義・コマンド・ダイアログ・ウィジェットなどを足すプラグインは、自分の足す id と定義の型（typeof 定義）を、ここに declare module で書き足す。
// ビルトインプラグインも追加プラグインも同じ口を使う（追加プラグインからは matomezu/catalog の名前で、このファイルを指す）。ここから id の型・ブックの型・アクションの引数の型などが決まる。
// 書き足しは、このファイルに向ける。このファイルを読み直して出す別のファイルに向けると、ほかの書き足しと合わさらない。
// 書き足した id と、インスタンスに渡した定義の id がそろっているかは、組み立て（createMatomezu）が型で確かめる
export interface BookTypeTable {}
export interface ItemTable {}
export interface ActionTable {}
export interface ThemeTable {}
export interface PaperTable {}
export interface TextColorTable {}
export interface SkinTable {}
export interface SettingTable {}
export interface PresentationTable {}
export interface ToolTable {}
export interface ToolSetTable {}
export interface MessageTable {} // 文言の鍵 → 訳
export interface CommandTable {}
export interface DialogTable {}

// タイプが選んだアイテムに渡す指定: アイテムの id → 指定の形。アイテムを作ったプラグインが自分のアイテムの指定の形を書き足し、
// 自分の処理で読む（土台は意味を知らない）
export interface ItemOptionTable {}

// アイテムの能力 → true。土台は connectable（線などでつなげる）・resizable（大きさを変えられる）・nests（子の形の並び shapes を持てる）。
// プラグインは自分の id を頭に付けた能力を書き足し、自分の処理で読む（土台は意味を知らない）
export interface CapabilityTable {
  connectable: true
  resizable: true
  nests: true
}

// キーの範囲（割り当てが効く所）→ true。土台は global（ダイアログもメニューも開いていないとき、ステージに結び付かない画面全体のキー）・stage（カレントのステージ）・dialog・menu（開いているメニュー: 右クリックのメニューと道具のアイコン）。
// プラグインは自分の id を頭に付けた範囲を書き足し、自分のウィジェットの要素に data-key-scope で名乗らせる
export interface KeyScopeTable {
  global: true
  stage: true
  dialog: true
  menu: true
}

// 画面の配置の分。スロットは「id → そこに置くウィジェットが受け取る値」。スロットを描くウィジェットを持つプラグインが、そのスロットを書き足す
export interface SlotTable {
  root: Record<string, never> // 画面の根（土台が描く、ただ 1 つのスロット）
}
export interface WidgetTable {}
export interface MenuTable {} // メニューの id → true
// 右クリックのメニューの id → 受け取る物（右クリックされた物。項目のコマンドに引数として渡す。何も受け取らなければ Record<string, never>）
export interface ContextMenuTable {}

// 定義の種類: プラグインが持てる定義のフィールドの名前 → その種類が入る台帳（core 台帳か store 台帳）と、error の文に使う名前。
// 種類を足すときは、ここに 1 行と、下の PartTables に id の表を足し、定義の型をその台帳の層から PartDefTable に書き足す（core の種類は core/core-catalog.ts、store の種類は store/plugin.ts）
export const PARTS = {
  bookTypes: { catalog: "core", label: "bookType" },
  items: { catalog: "core", label: "item" },
  actions: { catalog: "core", label: "action" },
  settings: { catalog: "core", label: "setting" },
  presentations: { catalog: "core", label: "presentation" },
  tools: { catalog: "core", label: "tool" },
  toolSets: { catalog: "core", label: "toolSet" },
  themes: { catalog: "core", label: "theme" },
  papers: { catalog: "core", label: "paper" },
  textColors: { catalog: "core", label: "textColor" },
  skins: { catalog: "core", label: "skin" },
  commands: { catalog: "store", label: "command" },
  dialogs: { catalog: "store", label: "dialog" },
} as const
export type Part = keyof typeof PARTS
export type CorePart = { [K in Part]: (typeof PARTS)[K]["catalog"] extends "core" ? K : never }[Part]
export type StorePart = Exclude<Part, CorePart>
export const partsOf = <S extends "core" | "store">(name: S) =>
  (Object.keys(PARTS) as Part[]).filter(k => PARTS[k].catalog === name) as (S extends "core" ? CorePart : StorePart)[]

// 種類ごとの id の表（PARTS と同じ種類を並べる。足りなければ、種類ごとに引く所 PartTables[Part] が型の誤りになる）
export interface PartTables {
  bookTypes: BookTypeTable
  items: ItemTable
  actions: ActionTable
  settings: SettingTable
  presentations: PresentationTable
  tools: ToolTable
  toolSets: ToolSetTable
  themes: ThemeTable
  papers: PaperTable
  textColors: TextColorTable
  skins: SkinTable
  commands: CommandTable
  dialogs: DialogTable
}
// 種類ごとの定義の型。その台帳の層が書き足す（ここは空。書き足し忘れは、種類ごとに引く所 PartDefTable[Part] が型の誤りになる）
export interface PartDefTable {}

export type BookTypeId = keyof BookTypeTable & string
// 1 冊だけのタイプの id（そのブックの id でもある）
export type SingleBookTypeId = { [K in BookTypeId]: BookTypeTable[K] extends { single: true } ? K : never }[BookTypeId]
export type ItemId = keyof ItemTable & string
export type ActionId = keyof ActionTable & string
export type ThemeId = keyof ThemeTable & string
export type PaperId = keyof PaperTable & string
export type TextColorId = keyof TextColorTable & string
export type SkinId = keyof SkinTable & string
export type SettingId = keyof SettingTable & string
export type PresentationId = keyof PresentationTable & string
export type ToolId = keyof ToolTable & string
export type ToolSetId = keyof ToolSetTable & string
export type MessageKey = keyof MessageTable & string
export type CommandId = keyof CommandTable & string
export type KeyScopeId = keyof KeyScopeTable & string
export type DialogId = keyof DialogTable & string
export type SlotId = keyof SlotTable & string
export type WidgetId = keyof WidgetTable & string
export type MenuId = keyof MenuTable & string
export type ContextMenuId = keyof ContextMenuTable & string
export type SlotProps<S extends SlotId> = SlotTable[S]

// 定義オブジェクトの拡張ポイント: どの定義オブジェクトの型も、種類ごとの拡張ポイントを 1 つ含む（ここは空）。
// 土台の定義オブジェクトの型に書くのは土台が読むフィールド・メソッドだけで、ほかのプラグインが読むものは、読む側のプラグインが
// ここに declare module で書き足す（base も追加プラグインも。追加プラグインからは matomezu/catalog）。定義を書くプラグインは、書き足されたものを
// 自分の定義オブジェクトに書く（型が効く）。base は短い名前、base 以外は "<プラグインの id>:<名前>"（例 "@foo/pdf:draw"）で書き足す
export interface BookTypeExtras {}
// 形とつなぐものの拡張ポイントは、書き足すメソッドが置いたデータの型 D を使えるように型引数を持つ（書き足すときも同じ型引数で書く）。
// dataOf は D を拡張ポイントに結ぶためだけの型の印で、値は持たない
declare const dataOf: unique symbol
export interface ShapeItemExtras<D extends ShapeData = ShapeData> {
  readonly [dataOf]?: D
}
export interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
  readonly [dataOf]?: D
}
export interface ActionExtras {}
export interface ThemeExtras {}
export interface TokenExtras {}
export interface PaperExtras {}
export interface TextColorExtras {}
export interface SkinExtras {}
export interface SettingExtras {}
export interface PresentationExtras {}
export interface ToolExtras {}
export interface ToolSetExtras {}
export interface MessageSetExtras {}
export interface LanguagePackExtras {}
export interface CommandExtras {}
export interface DialogExtras {}
export interface KeyExtras {}
export interface WidgetExtras {}
export interface LayoutExtras {}
export interface BookViewExtras {}
