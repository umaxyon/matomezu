// ウィジェット（スロットに置けるコンポーネント）・配置（スロットごとに置くウィジェットの順と、メニューの中身）の定義と、配置の確かめ
import type { ReactNode } from "react"
import { type Problem, problem } from "../core/errors"
import type {
  CommandId,
  ContextMenuId,
  ContextMenuTable,
  MenuId,
  SlotId,
  SlotProps,
  WidgetId,
  WidgetTable,
} from "../core/tables"
import type { CommandArgs } from "../store/commands"

// 置けるスロットと、描くコンポーネント。置けるスロットは、どれも同じ値（props）を渡すものだけにする。
// スロットとメニューを開けるのはウィジェットとブックのビューだけで、コンポーネントの中で描くスロット（<Slot>）とメニュー（useMenu）、
// 開く右クリックのメニュー（useContextMenu）は opens・menus・contextMenus に全部書く
// （書いたものが、そのスロットとメニューを開ける約束）。ほかのプラグインのスロットを開けてもよい（骨組みの差し替え）
export interface WidgetDef<S extends SlotId = SlotId> {
  id: string // 追加プラグインは「プラグインの id/名前」
  slots: readonly S[]
  opens?: readonly SlotId[]
  menus?: readonly MenuId[]
  contextMenus?: readonly ContextMenuId[]
  view: (props: SlotProps<S>) => ReactNode
}
// どれかのウィジェット（表に入れるときの形）
export interface AnyWidgetDef {
  id: string
  slots: readonly SlotId[]
  opens?: readonly SlotId[]
  menus?: readonly MenuId[]
  contextMenus?: readonly ContextMenuId[]
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
// 右クリックのメニューに置けるコマンド: 引数を取らないものと、そのメニューが受け取る物を引数に取れるもの
export type ContextMenuCommandId<M extends ContextMenuId> = {
  [K in CommandId]: CommandArgs<K> extends []
    ? K
    : CommandArgs<K> extends [infer A]
      ? ContextMenuTable[M] extends A
        ? K
        : never
      : never
}[CommandId]

// 右クリックのメニューの区切り線（種類の違う項目の間に引く）
export const SEPARATOR = "-"
export type ContextMenuEntry<M extends ContextMenuId> = ContextMenuCommandId<M> | typeof SEPARATOR

// 出ている項目の並びから、先頭・末尾・続けての区切り線を消す
export function tidySeparators<T extends string>(entries: readonly (T | typeof SEPARATOR)[]): (T | typeof SEPARATOR)[] {
  const out: (T | typeof SEPARATOR)[] = []
  for (const e of entries) if (e !== SEPARATOR || (out.length > 0 && out.at(-1) !== SEPARATOR)) out.push(e)
  if (out.at(-1) === SEPARATOR) out.pop()
  return out
}

export interface LayoutDef {
  id: string
  slots: { [S in SlotId]?: readonly WidgetsFor<S>[] }
  menus: { [M in MenuId]?: readonly MenuItem[] }
  contextMenus?: { [M in ContextMenuId]?: readonly ContextMenuEntry<M>[] } // 区切り線は SEPARATOR
}
export const defineLayout = <const L extends LayoutDef>(def: L): L => def

export const menuCommands = (item: MenuItem): readonly MenuCommandId[] =>
  typeof item === "string" ? [item] : item.either

// 根のスロット（土台が開ける）
export const ROOT_SLOT = "root" satisfies SlotId

// 配置の食い違い: 知らないウィジェット・置けないスロットに置いたウィジェット・インスタンスに無いコマンド・
// 中身を書いたのに、置いたウィジェットのどれも開けないスロットとメニュー、置いたウィジェットと見せ方・アイテムのビューのどれも開かない右クリックのメニュー（無ければ空）
export function checkLayout(
  layout: LayoutDef,
  views: {
    widgets: ReadonlyMap<string, AnyWidgetDef>
    presentationViews: ReadonlyMap<string, { contextMenus?: readonly string[] }>
    connectors: ReadonlyMap<string, { contextMenus?: readonly string[] }>
    items: ReadonlyMap<string, { contextMenus?: readonly string[] }>
  },
  commands: ReadonlySet<string>,
): Problem[] {
  const { widgets } = views
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
  const contextMenus = Object.entries(layout.contextMenus ?? {}) as [string, readonly string[]][]
  for (const [menu, ids] of contextMenus)
    for (const id of ids)
      if (id !== SEPARATOR && !commands.has(id))
        problems.push(problem("E209", { layout: layout.id, menu, command: id }))
  const { slots, menus, contextMenus: openedMenus } = opened(layout, widgets)
  for (const view of [...views.presentationViews.values(), ...views.connectors.values(), ...views.items.values()])
    for (const m of view.contextMenus ?? []) openedMenus.add(m)
  for (const [slot, ids] of Object.entries(layout.slots) as [string, readonly string[]][])
    if (ids.length > 0 && !slots.has(slot)) problems.push(problem("E211", { layout: layout.id, slot }))
  for (const [menu, items] of Object.entries(layout.menus) as [string, readonly MenuItem[]][])
    if (items.length > 0 && !menus.has(menu)) problems.push(problem("E212", { layout: layout.id, menu }))
  for (const [menu, ids] of contextMenus)
    if (ids.length > 0 && !openedMenus.has(menu)) problems.push(problem("E213", { layout: layout.id, menu }))
  return problems
}

// 画面に開くスロットとメニュー（右クリックのメニューも）: 根のスロットから、置いたウィジェットが開けるものをたどる
function opened(layout: LayoutDef, widgets: ReadonlyMap<string, AnyWidgetDef>) {
  const slots = new Set<string>([ROOT_SLOT])
  const menus = new Set<string>()
  const contextMenus = new Set<string>()
  const next = [ROOT_SLOT]
  for (let slot = next.pop(); slot !== undefined; slot = next.pop())
    for (const id of (layout.slots as Record<string, readonly string[] | undefined>)[slot] ?? []) {
      const w = widgets.get(id)
      for (const s of w?.opens ?? []) if (!slots.has(s)) next.push(slots.add(s) && s)
      for (const m of w?.menus ?? []) menus.add(m)
      for (const m of w?.contextMenus ?? []) contextMenus.add(m)
    }
  return { slots, menus, contextMenus }
}
