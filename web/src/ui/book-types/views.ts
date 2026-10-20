// ブックのタイプごとのビュー。core の登録表（core/book-types）のタイプは、全部ここにビューを持つ（抜けると型の誤り）
import type { ComponentType } from "react"
import type { BookTypeId } from "../../core/registry"
import type { Stage } from "../../core/stage"
import { DrawingView } from "./DrawingView"
import { MasterView } from "./MasterView"

export const BOOK_VIEWS: Record<BookTypeId, ComponentType<{ stage: Stage }>> = {
  drawing: DrawingView,
  master: MasterView,
}
