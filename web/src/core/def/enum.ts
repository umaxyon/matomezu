// 列挙: プラグインが宣言する「値の組」。宣言した列挙に、ほかのプラグイン（と宣言した自分）が値を足せる（どのプラグインがどの値を足すかは、組み込まれたプラグインで決まる）。
// core は値の中を読まず、宣言の value（値が持つフィールドの形。id・title・aiDescription は core が持つので書かない）で確かめるだけ。読むのは宣言したプラグインだけ（enumValuesOf）。
// 値はデータだけで、メソッドを持たない
import type { z } from "zod"
import type { EnumExtras, EnumTable, EnumValueExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface EnumDef<V extends z.ZodObject = z.ZodObject, Tt extends string = MessageKey> extends EnumExtras {
  id: string // 本当の id（例: @matomezu/taskboard:history-topic）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。この列挙が何の値の組で、値をどこで選ぶか）
  value: V // 値が持つフィールドの形（id・title・aiDescription のほか）
}

// 列挙の値。列挙 enum（宣言の id）に足す。data は宣言の value の形
export interface EnumValueDef<E extends string = string, D = unknown, Tt extends string = MessageKey>
  extends EnumValueExtras {
  id: string // 本当の id（値を足したプラグインの id が頭に付く）
  enum: E
  title: Tt
  aiDescription: string // AI 向けの説明（英語。この値を選ぶのはどんなときか）
  data: D
}

// 宣言 E の値の data の形（宣言が表に書き足されているとき）
export type EnumDataOf<E extends string> = E extends keyof EnumTable ? z.input<EnumTable[E]["value"]> : unknown
