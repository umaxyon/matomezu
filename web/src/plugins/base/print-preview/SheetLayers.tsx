// 印刷区画 1 つの中身: レイヤー（スロット sheet-layers）を下から重ねて描く。ブックの中身（ページのタイプのプレゼンテーションの printSheet）は、ウィジェット sheet-content が描く。
// 印刷プレビューと印刷と、ページ一覧のサムネイルが使う（描く物が同じになる）
import { pageType } from "../../../core/core-catalog"
import { Slot } from "../../../ui/Slot"
import { useZoomHere } from "../../../ui/scope"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { SHEET_LAYERS } from "../workspace/slots"
import type { PrintSheetProps } from "./PrintPreviewView"

// 倍率は、描いている場所（ui/scope.tsx）の倍率を渡す
export function SheetLayers(props: Omit<PrintSheetProps, "zoom">) {
  const zoom = useZoomHere()
  return <Slot name={SHEET_LAYERS} props={{ ...props, zoom }} />
}

// ページの中身のレイヤー: ページのタイプのプレゼンテーションの印刷区画 1 つのビュー（無ければ白紙）
export function SheetContent(props: PrintSheetProps) {
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const Sheet = views.get(pageType(catalog, props.page.type).presentation)?.printSheet
  return Sheet ? <Sheet {...props} /> : null
}
