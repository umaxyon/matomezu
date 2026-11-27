// slide プラグインの台帳アセンブルのときの確かめ: ページのタイプの slide.allowed は、ケイパビリティ ON_SLIDE を持つ形だけ
import { type CatalogCheckDef, problem } from "../../../plugin-api/builtin"
import { ON_SLIDE } from "./slide"

export const ON_SLIDE_CHECK: CatalogCheckDef = catalog =>
  [...catalog.pageTypes.values()].flatMap(t =>
    (t.slide?.allowed ?? [])
      .filter(id => {
        const def = catalog.items.get(id)
        return def?.kind === "shape" && !def.capabilities.includes(ON_SLIDE)
      })
      .map(id => problem("E134", { id: t.id, ref: id, capability: ON_SLIDE })),
  )
