// アノテーションの定義: ブックの物（id を持つ物）に結び付き、ブックのデータとは別に残る物の種類（base のコメントなど）。プラグインが種類を足す。
// アノテーションのデータは { id, annotation（種類の id）, anchors（結び付く物の id）, props（種類ごとの形） }（core/annotation.ts）。
// core が知るのは id・annotation・anchors だけで、props の形は種類が決める。図の中身ではないので、画面の履歴にもロックにも掛からない
import type { z } from "zod"
import type { AnnotationExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface AnnotationDef<P extends z.ZodType = z.ZodType, Tt extends string = MessageKey>
  extends AnnotationExtras {
  id: string // 本当の id（例: @matomezu/base:comment）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。何のための物で、AI がどう応えるか）
  props: P // 種類ごとの形
  awaits?(props: z.output<P>): boolean // AI の応えを待っているか（無ければ待たない。待っている物を AI に知らせる）
}

export function defineAnnotation<const Id extends string, P extends z.ZodType>(
  def: AnnotationDef<P> & { id: Id },
): AnnotationDef<P> & { id: Id } {
  return def
}
