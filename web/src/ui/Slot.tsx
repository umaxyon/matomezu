// スロット: 配置がそのスロットに置いたウィジェットを、並びの順に描く。props はスロットが決めた値で、どのウィジェットにも同じものを渡す
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
