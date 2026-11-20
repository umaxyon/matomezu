// 左サイドパネルの、タブを作る関数と、開く側が渡すタブの組の部品。入れ物は window/WindowView.tsx が窓に 1 つ描く
import type { ReactNode } from "react"
import type { SlotId } from "../../../core/catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget, type WidgetDef } from "../../../ui/layout"
import type { LeftSidePanelEntry } from "./state"

// 左サイドパネルのタブのウィジェット: どのスロットにも置かない（開く側が渡したタブの組で出る）。タブの名前 title（文言の鍵）を必ず持つ。
// view は、開く側が渡す物 P を受ける（関数を含まない、データだけ）。opens は、タブの中身が開けるスロット（開く側のウィジェットが、渡すタブの opens を名乗る）
export const defineLeftSidePanelTab = <const Id extends string, P = Record<string, never>>(def: {
  id: Id
  title: MessageKey
  opens?: readonly SlotId[]
  useCount?: () => number // 開くボタンとタブに出す数（未読など）を読むフック
  scope?: "stage" | "window" // タブが見せる物の範囲（無ければ "window"）。"stage" なら、開いた所のステージの物を見せる
  view: (props: P) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [] as readonly never[],
    ...(def.opens ? { opens: def.opens } : {}),
    leftSidePanel: {
      title: def.title,
      scope: def.scope ?? "window",
      ...(def.useCount ? { useCount: def.useCount } : {}),
    },
    view: def.view,
  }) as WidgetDef<never> & { id: Id; view: (props: P) => ReactNode }

// 開く側が渡す、タブ 1 つ分: タブ tab（defineLeftSidePanelTab で作ったウィジェット）と、その view に渡す物
export function tabEntry<P>(tab: { id: string; view: (props: P) => ReactNode }, props: P): LeftSidePanelEntry {
  return { tab: tab.id, props }
}

// 渡すタブの opens を集める（開く側のウィジェットが名乗る）
export const opensOf = (...tabs: readonly { opens?: readonly SlotId[] }[]): readonly SlotId[] => [
  ...new Set(tabs.flatMap(t => t.opens ?? [])),
]

export { useCloseLeftSidePanel, useLeftSidePanel, useOpenLeftSidePanel } from "./hooks"
export { LeftSidePanelOpenButton } from "./OpenButton"
export { LEFT_SIDE_PANEL } from "./slots"
export type { LeftSidePanelEntry, LeftSidePanelOpen } from "./state"
