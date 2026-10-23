// アイテムの定義: データに残り、画面に置かれるもの（名詞）。並べ方は知らず、自分の形・大きさ・能力・項目の形だけを持つ。
// kind はアイテムのタイプで、kind ごとに持つ項目が変わる。置いたアイテムのデータの外枠（id・位置・つなぐ相手）は kind ごとに土台が決める（core/placed.ts）
import type { z } from "zod"
import type { Rect, Size } from "../geom"
import type { MessageKey } from "../i18n/i18n"
import type { TokenDecl } from "./theme"

// アイテムが持つ能力。アクションは、対象に求める能力で使えるかを決める（アクションはアイテムの一覧を持たない）
export type Capability = "connectable" | "resizable" | "hasText"

interface ItemBase {
  id: string // 「kind.名前」（例: shape.box）。データはこれで参照する
  version: number // 項目の形の版
  title: MessageKey
  capabilities: readonly Capability[]
  toolbox: boolean // ツールボックスに出すか（出さないものは、ほかの操作で置く）
  props: z.ZodType // 置いたアイテムが持つ項目の形
  tokens: readonly TokenDecl[] // 描くのに使うテーマの欄
}

// 置いた形のデータ（外枠の id・左上・大きさと、項目 props と中身の欄）
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

// 2 つの形 a・b の間隔の下限
export type Gap = (a: string, b: string) => number

// 画面に置ける形。D は置いたデータの型（項目と中身の型が決まったもの）
export interface ShapeItemDef<D extends ShapeData = ShapeData> extends ItemBase {
  kind: "shape"
  size: Size // 置くときの大きさ
  content?: Readonly<Record<string, z.ZodType>> // 項目のほかに持つ中身の欄（リストの行など。どれも書かなくてよい）
  min?: Size // 一番小さい大きさ（大きさを変えられるアイテムだけ）
  sizeOf(item: D): Size // 置いたアイテムの大きさ（w・h が無ければ、項目から決まる幅と高さ）
  captionWidth(item: D): number // キャプションが切れずに見える幅（キャプションで広げる幅と、縮めてよい横の下限）
  settle?(item: D): D // 項目を変えたあとに、項目に合わせて中身を整える
  dialogs: { add: string; edit: string } // 置く前に中身を決める追加のダイアログと、中身を変える編集のダイアログの id
}

// 2 つの形をつなぐもの（線）。大きさを持たず、つないだ形の位置から形が決まる。
// 置いた形との決まりを持つ: つないだ組の間隔の下限（gaps）、形が変わったあとの整え（tidy）、関係の決まり（holds）
export interface ConnectorItemDef<D extends ConnectorData = ConnectorData> extends ItemBase {
  kind: "connector"
  gaps?(lines: readonly D[], base: Gap): Gap
  // rects は形の四角、setting はそのページで効いている設定の値（設定の定義の id から）
  tidy?(lines: readonly D[], rects: ReadonlyMap<string, Rect>, setting: (id: string) => unknown): D[]
  holds?(lines: readonly D[], connectable: (id: string) => boolean): boolean
}

// 表に入れるときの型（関数はメソッドの形なので、置いたデータの型の決まった定義も入る）
export type ItemDef = ShapeItemDef | ConnectorItemDef
export type ItemKind = ItemDef["kind"]

// 項目の形 P と中身の欄 C から、置いたデータの型
type ContentOf<C> = { [K in keyof C]?: C[K] extends z.ZodType ? z.output<C[K]> : never }
export type ShapeDataOf<P extends z.ZodType, C = object> = ShapeData<z.output<P>> & ContentOf<C>
export type ConnectorDataOf<P extends z.ZodType> = ConnectorData<z.output<P>>

// 形の定義。置いたデータを受け取る関数は、項目（props）と中身（content）の形から型が決まる
export function defineShape<
  const Id extends string,
  P extends z.ZodType,
  const C extends Readonly<Record<string, z.ZodType>> = Record<never, never>,
>(
  def: Omit<ShapeItemDef<ShapeDataOf<P, C>>, "id" | "props" | "content" | "kind"> & {
    id: Id
    kind: "shape"
    props: P
    content?: C
  },
): Omit<ShapeItemDef<ShapeDataOf<P, C>>, "content"> & { id: Id; kind: "shape"; props: P; content?: C } {
  return def
}

// つなぐものの定義
export function defineConnector<const Id extends string, P extends z.ZodType>(
  def: Omit<ConnectorItemDef<ConnectorDataOf<P>>, "id" | "props" | "kind"> & { id: Id; kind: "connector"; props: P },
): ConnectorItemDef<ConnectorDataOf<P>> & { id: Id; kind: "connector"; props: P } {
  return def
}
