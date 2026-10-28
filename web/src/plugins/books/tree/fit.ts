// ツリーのページが紙に入るか: ページの根（root を渡せばそれ）を、そのページで効いている伸びる向きで並べ、どの節も紙に収まるか（描けない紙のページは確かめない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { paperSize } from "../../base"
import { GROW } from "./grow"
import { layoutTree } from "./layout"
import { type TreeRoot, TreeRootSchema } from "./node"

// setting は、そのページで効いている設定の値を読む関数
export function treeFits(
  catalog: CoreCatalog,
  page: ItemPage,
  setting: (id: string) => unknown,
  root?: TreeRoot,
): boolean {
  const found = root ?? TreeRootSchema.safeParse("root" in page ? page.root : undefined).data
  const paper = paperSize(catalog, page)
  if (!paper) return true
  if (!found) return false
  return layoutTree(found, GROW.schema.safeParse(setting(GROW.id)).data ?? "down", paper).fits
}
