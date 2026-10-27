// アイテムの定義: データに残り、画面に置かれるもの（名詞）。並べ方は知らず、自分の形・大きさ・能力・項目の形だけを持つ。
// kind はアイテムのタイプで、kind ごとに持つ項目が変わる。置いたアイテムのデータの外枠（id・位置・つなぐ相手）は kind ごとに土台が決める（core/placed.ts のスキーマ）
import type { z } from "zod"
import type { CapabilityTable, ConnectorItemExtras, ShapeItemExtras } from "../catalog"
import type { Point, Size } from "../geom"
import type { MessageKey } from "../i18n/i18n"
import type { TokenDef } from "./theme"

// アイテムが持つ能力（core/catalog.ts の CapabilityTable の名前）。土台とプラグインの処理が、アイテムに何ができるかを見るのに使う
export type Capability = keyof CapabilityTable & string

interface ItemBase<Tt extends string = MessageKey> {
  id: string // 本当の id（「プラグインの id:名前」。例: @matomezu/box:shape-box）。データはこれで参照する
  version: number // 項目の形の版
  title: Tt
  capabilities: readonly Capability[]
  props: z.ZodType // 置いたアイテムが持つ項目の形
  tokens: readonly TokenDef[] // 描くのに使うテーマキー
}

// 置いた形のデータ（外枠の id・左上・大きさと、項目 props と中身のフィールド）
export interface ShapeData<P = unknown> {
  id: string
  x: number
  y: number
  item: string
  w?: number
  h?: number
  props: P
}

// 置いた線のデータ（from から to へ。同じ形なら自分に戻る線）
export interface ConnectorData<P = unknown> {
  id: string
  item: string
  from: string
  to: string
  props: P
}

// 形の追加のダイアログに渡す値: 置くページと、置こうとした左上（紙の上の px）
export interface ShapeAddArgs {
  page: string
  at: Point
}
// 形の編集のダイアログに渡す値: ページと、置いた形の id
export interface ShapeEditArgs {
  page: string
  item: string
}

// 画面に置ける形。D は置いたデータの型（項目と中身の型が決まったもの）
export interface ShapeItemDef<D extends ShapeData = ShapeData, Tt extends string = MessageKey>
  extends ItemBase<Tt>,
    ShapeItemExtras<D> {
  kind: "shape"
  size: Size // 置くときの大きさ
  content?: Readonly<Record<string, z.ZodType>> // 項目のほかに持つ中身のフィールド（リストの行など。どれも書かなくてよい）
  min?: Size // 一番小さい大きさ（大きさを変えられるアイテムだけ）
  // 置く前に中身を決める追加のダイアログ（ShapeAddArgs を受ける）と、中身を変える編集のダイアログ（ShapeEditArgs を受ける）の id。
  // 追加が無ければそのまま置き、編集が無ければ「設定」を出さない。受ける値が合うかは definePlugin が型で確かめる
  dialogs?: { add?: string; edit?: string }
}

// 2 つの形をつなぐもの（線）。大きさを持たず、つないだ形の位置から形が決まる。
// 置いた形との関係の決まり（holds）を持つ
export interface ConnectorItemDef<D extends ConnectorData = ConnectorData, Tt extends string = MessageKey>
  extends ItemBase<Tt>,
    ConnectorItemExtras<D> {
  kind: "connector"
  holds?(lines: readonly D[], connectable: (id: string) => boolean): boolean
}

// 表に入れるときの型（関数はメソッドの形なので、置いたデータの型の決まった定義も入る）
export type ItemDef = ShapeItemDef | ConnectorItemDef
export type ItemKind = ItemDef["kind"]

// 項目の形 P と中身のフィールド C から、置いたデータの型
type ContentOf<C> = { [K in keyof C]?: C[K] extends z.ZodType ? z.output<C[K]> : never }
export type ShapeDataOf<P extends z.ZodType, C = object> = ShapeData<z.output<P>> & ContentOf<C>
export type ConnectorDataOf<P extends z.ZodType> = ConnectorData<z.output<P>>

// 形の定義。置いたデータを受け取る関数は、項目（props）と中身（content）の形から型が決まる
export function defineShape<
  const Id extends string,
  P extends z.ZodType,
  const C extends Readonly<Record<string, z.ZodType>> = Record<never, never>,
  const G extends { add?: string; edit?: string } = Record<never, never>,
>(
  def: Omit<ShapeItemDef<ShapeDataOf<P, C>>, "id" | "props" | "content" | "kind" | "dialogs"> & {
    id: Id
    kind: "shape"
    props: P
    content?: C
    dialogs?: G
  },
): Omit<ShapeItemDef<ShapeDataOf<P, C>>, "content" | "dialogs"> & {
  id: Id
  kind: "shape"
  props: P
  content?: C
  dialogs?: G
} {
  return def
}

// つなぐものの定義
export function defineConnector<const Id extends string, P extends z.ZodType>(
  def: Omit<ConnectorItemDef<ConnectorDataOf<P>>, "id" | "props" | "kind"> & { id: Id; kind: "connector"; props: P },
): ConnectorItemDef<ConnectorDataOf<P>> & { id: Id; kind: "connector"; props: P } {
  return def
}
