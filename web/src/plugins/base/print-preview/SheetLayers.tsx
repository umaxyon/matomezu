// 印刷区画 1 つの中身: レイヤー（スロット sheet-layers）を下から重ねて描く。ブックの中身（ブックのタイプの見せ方の printSheet）は、ウィジェット sheet-content が描く。
// 印刷プレビューと印刷と、ページ一覧のサムネイルが使う（描く物が同じになる）
import { bookType } from "../../../core/core-catalog"
import { Slot } from "../../../ui/Slot"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { SHEET_LAYERS } from "../workspace/slots"
import type { PrintSheetProps } from "./PrintPreviewView"

export function SheetLayers(props: PrintSheetProps) {
  return <Slot name={SHEET_LAYERS} props={props} />
}

// ブックの中身のレイヤー: ブックのタイプの見せ方の印刷区画 1 つのビュー（無ければ白紙）
export function SheetContent(props: PrintSheetProps) {
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const Sheet = views.get(bookType(catalog, props.book.type).presentation)?.printSheet
  return Sheet ? <Sheet {...props} /> : null
}
