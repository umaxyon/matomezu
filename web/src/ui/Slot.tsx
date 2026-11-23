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

// スロット name に置いたウィジェットのうち、種類 kind を名乗る（forKind）最初の 1 つのビュー（無ければ undefined）
export function useKindView<S extends SlotId>(
  name: S,
  kind: string | undefined,
): ((props: SlotProps<S>) => ReactNode) | undefined {
  const ids: readonly string[] = useLayout().slots[name] ?? []
  const { widgets } = useUiCatalog()
  if (kind === undefined) return undefined
  const id = ids.find(w => widgets.get(w)?.forKind === kind)
  return id ? (widgets.get(id)?.view as (props: SlotProps<S>) => ReactNode) : undefined
}

// スロット name に置いたウィジェットのうち、種類 kind を名乗る 1 つを描く（無ければ何も描かない）
export function KindSlot<S extends SlotId>({ name, kind, props }: { name: S; kind: string; props: SlotProps<S> }) {
  const View = useKindView(name, kind) as ((props: object) => ReactNode) | undefined
  return View ? <View {...(props as object)} /> : null
}
