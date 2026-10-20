// アイテムの定義: データに残り、画面に置かれるもの（名詞）。並べ方は知らず、自分の形・大きさ・能力・項目の形だけを持つ。
// kind はアイテムのタイプで、kind ごとに持つ項目が変わる
import type { z } from "zod"
import type { Size } from "../geom"
import type { MessageKey } from "../i18n/i18n"
import type { TokenDecl } from "./theme"

// アイテムが持つ能力。アクションは、対象に求める能力で使えるかを決める（アクションはアイテムの一覧を持たない）
export type Capability = "connectable" | "resizable" | "hasText"

interface ItemBase {
  id: string // 「kind.名前」（例: shape.box）。データはこれで参照する
  version: number // 項目の形の版
  title: MessageKey
  capabilities: readonly Capability[]
  props: z.ZodType // 置いたアイテムが持つ項目の形
  tokens: readonly TokenDecl[] // 描くのに使うテーマの欄
}

// 画面に置ける形
export interface ShapeItemDef extends ItemBase {
  kind: "shape"
  size: Size // 置いたときの大きさ
}

export type ItemDef = ShapeItemDef
export type ItemKind = ItemDef["kind"]

export function defineItem<const T extends ItemDef>(def: T): T {
  return def
}
