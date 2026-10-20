// ダイアログの id ごとの中身。型の表（store/tables.ts）に書き足したダイアログは、全部ここに中身を持つ（抜けると型の誤り）
import type { ComponentType } from "react"
import type { DialogId } from "../../store/tables"
import { OpenBookDialog } from "../book-search/OpenBookDialog"
import { NewBookDialog } from "./NewBookDialog"
import { NewPageDialog } from "./NewPageDialog"

// stage は開いたステージ、onClose は閉じるときに呼ぶ
export interface DialogProps {
  stage: string
  onClose: () => void
}

export const DIALOG_VIEWS: Record<DialogId, ComponentType<DialogProps>> = {
  "book.open": OpenBookDialog,
  "book.new": NewBookDialog,
  "page.new": NewPageDialog,
}
