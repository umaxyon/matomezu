// スロット: UI マッピングがそのスロットに置いたウィジェットを、並びの順に描く。props はスロットが決めた値で、どのウィジェットにも同じものを渡す。
// 種類ごとのスロット（KindSlot・useKindView）は、置いたウィジェットのうち、その種類を名乗る（forKind）最初の 1 つだけを描く
import type { ReactNode } from "react"
import type { SlotId, SlotProps } from "../core/catalog"
import { fail } from "../core/errors"
import { useLayout, useUiCatalog } from "./store-context"

export function Slot<S extends SlotId>({ name, props }: { name: S; props: SlotProps<S> }) {
  const ids: readonly string[] = useLayout().slots[name] ?? []
  const { widgets } = useUiCatalog()
  return ids.map(id => {
    const View = (widgets.get(id)?.view ?? fail("E109", { kind: "widget", id })) as (props: SlotProps<S>) => ReactNode
    return <View key={id} {...props} />
  })
}

// useKindView に、問う種類が無いと渡す値
export const NO_KIND = "none"
// 種類を名乗るウィジェットが無いときの値（useKindView）
export const NO_KIND_VIEW = "none"

// スロット name に置いたウィジェットのうち、種類 kind を名乗る（forKind）最初の 1 つのビュー（無ければ NO_KIND_VIEW）
export function useKindView<S extends SlotId>(
  name: S,
  kind: string,
): ((props: SlotProps<S>) => ReactNode) | typeof NO_KIND_VIEW {
  const ids: readonly string[] = useLayout().slots[name] ?? []
  const { widgets } = useUiCatalog()
  if (kind === NO_KIND) return NO_KIND_VIEW
  const id = ids.find(w => widgets.get(w)?.forKind === kind)
  const view = id === undefined ? undefined : widgets.get(id)?.view
  return view === undefined ? NO_KIND_VIEW : (view as (props: SlotProps<S>) => ReactNode)
}

// スロット name に置いたウィジェットのうち、種類 kind を名乗る 1 つを描く（無ければ何も描かない）
export function KindSlot<S extends SlotId>({ name, kind, props }: { name: S; kind: string; props: SlotProps<S> }) {
  const View = useKindView(name, kind) as ((props: object) => ReactNode) | typeof NO_KIND_VIEW
  return View === NO_KIND_VIEW ? null : <View {...(props as object)} />
}
