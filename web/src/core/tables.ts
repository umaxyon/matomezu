// 型を書き足す口（空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。定義を足すプラグインは、自分の足す id と定義の型（typeof 定義）を、ここに declare module で書き足す。
// 中の部品も外のプラグインも同じ口を使う。ここから id の型・ブックの型・アクションの引数の型などが決まる。
// 書き足した id と、app に渡した定義の id がそろっているかは、組み立て（createMatomezu）が型で確かめる
export interface BookTypeTable {}
export interface ItemTable {}
export interface ActionTable {}
export interface ThemeTable {}
export interface PaperTable {}
export interface MessageTable {} // 文言の鍵 → 訳

export type BookTypeId = keyof BookTypeTable & string
export type ItemId = keyof ItemTable & string
export type ActionId = keyof ActionTable & string
export type ThemeId = keyof ThemeTable & string
export type PaperId = keyof PaperTable & string
export type MessageKey = keyof MessageTable & string
