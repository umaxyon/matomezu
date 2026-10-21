// ウィジェット（スロットに置ける部品）・配置（スロットごとに置くウィジェットの順と、メニューの中身）の定義と、配置の確かめ
import type { ReactNode } from "react"
import { type Problem, problem } from "../core/errors"
import type { CommandArgs } from "../store/commands"
import type { CommandId } from "../store/tables"
import type { MenuId, SlotId, SlotProps, WidgetId, WidgetTable } from "./tables"

// 置けるスロットと、描く部品。置けるスロットは、どれも同じ値（props）を渡すものだけにする。
// スロットとメニューを開けるのはウィジェットだけで、部品の中で描くスロット（<Slot>）とメニュー（useMenu）は opens・menus に全部書く
// （書いたものが、そのスロットとメニューを開ける約束）。ほかのプラグインのスロットを開けてもよい（骨組みの差し替え）
export interface WidgetDef<S extends SlotId = SlotId> {
  id: string // 外のプラグインは「プラグインの id/名前」
  slots: readonly S[]
  opens?: readonly SlotId[]
  menus?: readonly MenuId[]
  view: (props: SlotProps<S>) => ReactNode
}
// どれかのウィジェット（表に入れるときの形）
export interface AnyWidgetDef {
  id: string
  slots: readonly SlotId[]
  opens?: readonly SlotId[]
  menus?: readonly MenuId[]
  view: (props: never) => ReactNode
}

export const defineWidget = <const Id extends string, const S extends SlotId>(
  def: WidgetDef<S> & { id: Id },
): WidgetDef<S> & { id: Id } => def

// そのスロットに置けるウィジェットの id（ウィジェットの slots にそのスロットがあるもの）
type WidgetsFor<S extends SlotId> = {
  [W in WidgetId]: WidgetTable[W] extends { slots: readonly (infer T)[] } ? (S extends T ? W : never) : never
}[WidgetId]

// メニューに置けるコマンド（引数を取らないもの）
export type MenuCommandId = { [K in CommandId]: CommandArgs<K> extends [] ? K : never }[CommandId]
// メニューの 1 項目: コマンド 1 つか、並べたうち出ている最初の 1 つを出す切り替え。押されている見た目はコマンドの active が決める
export type MenuItem = MenuCommandId | { either: readonly MenuCommandId[] }

export interface LayoutDef {
  id: string
  slots: { [S in SlotId]?: readonly WidgetsFor<S>[] }
  menus: { [M in MenuId]?: readonly MenuItem[] }
}
export const defineLayout = <const L extends LayoutDef>(def: L): L => def

export const menuCommands = (item: MenuItem): readonly MenuCommandId[] =>
  typeof item === "string" ? [item] : item.either

// 根のスロット（土台が開ける）
export const ROOT_SLOT = "app" satisfies SlotId

// 配置の食い違い: 知らないウィジェット・置けないスロットに置いたウィジェット・app に無いコマンド・
// 中身を書いたのに、置いたウィジェットのどれも開けないスロットとメニュー（無ければ空）
export function checkLayout(
  layout: LayoutDef,
  widgets: ReadonlyMap<string, AnyWidgetDef>,
  commands: ReadonlySet<string>,
): Problem[] {
  const problems: Problem[] = []
  for (const [slot, ids] of Object.entries(layout.slots) as [string, readonly string[]][])
    for (const id of ids) {
      const w = widgets.get(id)
      if (!w) problems.push(problem("E207", { layout: layout.id, slot, widget: id }))
      else if (!(w.slots as readonly string[]).includes(slot))
        problems.push(problem("E208", { layout: layout.id, slot, widget: id }))
    }
  for (const [menu, items] of Object.entries(layout.menus) as [string, readonly MenuItem[]][])
    for (const id of items.flatMap(menuCommands))
      if (!commands.has(id)) problems.push(problem("E209", { layout: layout.id, menu, command: id }))
  const { slots, menus } = opened(layout, widgets)
  for (const [slot, ids] of Object.entries(layout.slots) as [string, readonly string[]][])
    if (ids.length > 0 && !slots.has(slot)) problems.push(problem("E211", { layout: layout.id, slot }))
  for (const [menu, items] of Object.entries(layout.menus) as [string, readonly MenuItem[]][])
    if (items.length > 0 && !menus.has(menu)) problems.push(problem("E212", { layout: layout.id, menu }))
  return problems
}

// 画面に開くスロットとメニュー: 根のスロットから、置いたウィジェットが開けるものをたどる
function opened(layout: LayoutDef, widgets: ReadonlyMap<string, AnyWidgetDef>) {
  const slots = new Set<string>([ROOT_SLOT])
  const menus = new Set<string>()
  const next = [ROOT_SLOT]
  for (let slot = next.pop(); slot !== undefined; slot = next.pop())
    for (const id of (layout.slots as Record<string, readonly string[] | undefined>)[slot] ?? []) {
      const w = widgets.get(id)
      for (const s of w?.opens ?? []) if (!slots.has(s)) next.push(slots.add(s) && s)
      for (const m of w?.menus ?? []) menus.add(m)
    }
  return { slots, menus }
}
