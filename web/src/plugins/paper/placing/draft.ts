// ダイアログの下書きを重ねたページの整え: 下書きで変わった形（どの深さの子の形も）を、
// 形の整え（@matomezu/paper:settle。項目を変えるアクションがかけるもの）に通す。キャプションで広げる所（widenForCaption）は通さない
import {
  type CoreCatalog,
  findShape,
  type ItemPage,
  type PlacedShape,
  replaceShape,
  walkShapes,
} from "../../../plugin-api"
import { shapeDefOf } from "../../base"
import { kit } from "../kit"

export function settledDraft(catalog: CoreCatalog, page: ItemPage, draft: ItemPage): ItemPage {
  if (draft === page) return draft
  let settled = draft
  for (const { shape } of walkShapes(draft)) {
    const before = findShape(page, shape.id)?.shape
    if (!before || !ownChanged(shape, before)) continue
    const settle = shapeDefOf(catalog, shape.item)?.[kit.name("settle")]
    if (settle)
      settled = replaceShape(settled, shape.id, s => settle(s as never, before as never) as PlacedShape) ?? settled
  }
  return settled
}

// 形 shape が、前の形 before から自分のフィールド（子の並び shapes のほか）を変えたか。子が変わっただけの親は整えない
function ownChanged(shape: PlacedShape, before: PlacedShape): boolean {
  const own = (s: PlacedShape) => Object.entries(s).filter(([k]) => k !== "shapes")
  const was = new Map(own(before))
  const now = own(shape)
  return now.length !== was.size || now.some(([k, v]) => was.get(k) !== v)
}
