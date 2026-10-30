// ダイアログの下書きを重ねたページの整え: 下書きで変わったページの形（最上位の形。下書きは最上位の形にだけ重なる）を、
// 形の整え（@matomezu/paper:settle。項目を変えるアクションがかけるもの）に通す。キャプションで広げる所（widenForCaption）は通さない
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { kit } from "../kit"

export function settledDraft(catalog: CoreCatalog, page: ItemPage, draft: ItemPage): ItemPage {
  if (draft === page || !draft.items) return draft
  const items = draft.items.map(item => {
    const before = page.items?.find(i => i.id === item.id)
    if (!before || before === item || !("x" in item)) return item
    const def = catalog.items.get(item.item)
    const settle = def?.kind === "shape" ? def[kit.name("settle")] : undefined
    return settle ? (settle(item as never, before as never) as typeof item) : item
  })
  return { ...draft, items }
}
