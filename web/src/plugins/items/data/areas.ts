// データの枠の中の領域: 枠線の内側に、文字の領域（キャプションと本文。base の文字の塊）と、表やグラフを描く所を上下に並べる。
// 文字の領域は textAt が top なら上、bottom なら下で、none のときとキャプションも本文も無いときは出さない。
// 文字の領域の高さは本文を全部出した高さで、描く所が CONTENT_MIN より低くなるなら、本文を収まる行まで切る
import type { Size } from "../../../plugin-api"
import { captionTextWidth, TEXT_LOOK, textBlock, textBlockHeight } from "../../base"
import type { DataProps } from "./data"

// 枠の寸法（px）。DataItemView.module.css と同じ値にする
export const AREA_LOOK = { border: 1, padX: TEXT_LOOK.padX, padY: TEXT_LOOK.padY } as const
const F = AREA_LOOK
// 表やグラフを描く所の一番低い高さ（文字の領域で、これより低くしない）
export const CONTENT_MIN = 40
// 本文の列の一番狭い幅
const LEAST = 48

// 枠の中の幅で、文字の領域の中の幅（左右の余白の内側）
const innerOf = (w: number) => w - 2 * (F.border + F.padX)

// キャプションが切れずに見える幅（キャプションで広げる幅）
export const captionWidthOf = (caption: string): number => captionTextWidth(caption) + 2 * (F.border + F.padX)

// 文字の領域を出すか
export const textShown = (p: Pick<DataProps, "textAt" | "caption" | "body">): boolean =>
  p.textAt !== "none" && (p.caption !== "" || p.body !== "")

export interface DataAreas {
  text: { inner: number; least: number; maxH: number; height: number } | null // 文字の領域（出さなければ null。height は余白を含む）
  content: Size // 表やグラフを描く所（枠線の内側）
  contentTop: boolean // 描く所が文字の領域より上か
}

// 大きさ size のデータの枠の中の領域
export function areasOf(props: DataProps, size: Size): DataAreas {
  const w = size.w - 2 * F.border
  const h = size.h - 2 * F.border
  if (!textShown(props)) return { text: null, content: { w, h }, contentTop: true }
  const inner = innerOf(size.w)
  const maxH = Math.max(h - CONTENT_MIN - 2 * F.padY, 0)
  const height = textBlock(props, inner, LEAST, maxH).height + 2 * F.padY
  return {
    text: { inner, least: LEAST, maxH, height },
    content: { w, h: Math.max(h - height, 0) },
    contentTop: props.textAt === "bottom",
  }
}

// 幅 w の枠で、本文を全部出した文字の領域の高さ（余白を含む。出さなければ 0）
export const textAreaHeight = (props: DataProps, w: number): number =>
  textShown(props) ? textBlockHeight(props, innerOf(w), LEAST) + 2 * F.padY : 0
