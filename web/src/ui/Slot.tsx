// スロット: 配置がそのスロットに置いたウィジェットを、並びの順に描く。props はスロットが決めた値で、どのウィジェットにも同じものを渡す
import type { ReactNode } from "react"
import { fail } from "../core/errors"
import { useLayout, useUi } from "./store-context"
import type { SlotId, SlotProps } from "./tables"

export function Slot<S extends SlotId>({ name, props }: { name: S; props: SlotProps<S> }) {
  const ids: readonly string[] = useLayout().slots[name] ?? []
  const { widgets } = useUi()
  return ids.map(id => {
    const View = (widgets.get(id)?.view ?? fail("E109", { kind: "widget", id })) as (props: SlotProps<S>) => ReactNode
    return <View key={id} {...props} />
  })
}
