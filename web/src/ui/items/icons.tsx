// アイテムのアイコン（ツールボックスなどに出す）。core の登録表のアイテムは、全部ここにアイコンを持つ（抜けると型の誤り）
import type { ReactNode } from "react"
import type { ItemId } from "../../core/registry"

export const ITEM_ICONS: Record<ItemId, ReactNode> = {
  "shape.box": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="10" rx="1.5" />
    </svg>
  ),
}
