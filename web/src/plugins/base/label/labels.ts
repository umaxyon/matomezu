import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { idsIn } from "../../../core/ids"
import { connectorsOf, walkShapes } from "../../../core/placed"
import type { Page } from "../../../core/schema/book"
import { NO_SHAPE_DEF, shapeDefOf } from "../place/placed"
import { parseRich, plainOf } from "../text/rich"

export type AnchorLabel = { text: string } | { title: string }

// 本文の書き方の名前から、装飾を外した 1 行（空白だけなら null）
function plain(text: string | null | undefined): { text: string } | null {
  if (typeof text !== "string") return null
  const line = parseRich(text).map(plainOf).join(" ").trim()
  return line === "" ? null : { text: line }
}

// ページの並び pages（ステージで開いている物のページの全部）の物 id の名前（どのページにも無ければ null）
export function anchorLabel(catalog: CoreCatalog, pages: readonly Page[], id: string): AnchorLabel | null {
  for (const page of pages) {
    const type = pageType(catalog, page.type)
    // 中の形は別に歩くので、形の中の物から外す
    const shape = walkShapes(page).find(({ shape }) => idsIn({ ...shape, shapes: undefined }).includes(id))?.shape
    if (shape) {
      const def = shapeDefOf(catalog, shape.item)
      if (def === NO_SHAPE_DEF) return { title: shape.item }
      const caption =
        shape.id === id && def.captionProp
          ? (shape.props as Record<string, unknown> | undefined)?.[def.captionProp]
          : undefined
      const name = def.labelOf ? def.labelOf(shape, id) : typeof caption === "string" ? caption : ""
      return plain(name) ?? { title: def.title }
    }
    const line = connectorsOf(page).find(c => c.id === id)
    if (line) {
      const def = catalog.items.get(line.item)
      return plain(def?.kind === "connector" ? def.labelOf?.(line) : null) ?? { title: def?.title ?? line.item }
    }
    if (idsIn(page).includes(id)) return plain(type.labelOf?.(page, id)) ?? { title: type.title }
  }
  return null
}
