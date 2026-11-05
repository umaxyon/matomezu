// 伝言一覧の行の絵のスロットの名前と、渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）
import type { Annotation } from "../../../core/annotation"
import { kit } from "../kit"

export const ANNOTATION_ICON = kit.name("annotation-icon")

// 伝言一覧の行の絵のスロットに渡す物: 開いたステージと、行のアノテーション
export interface AnnotationIconProps {
  stage: string
  annotation: Annotation
}
