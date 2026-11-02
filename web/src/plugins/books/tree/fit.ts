// ツリーのページが紙に入るか: ページの根（root を渡せばそれ）を、そのページで効いている伸びる向きで並べ、どの節も紙に収まるか（描けない紙のページは確かめない。可変ページはいつも入る）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { paperSize, type SettingReader } from "../../base"
import { GROW, growSidesOf } from "./grow"
import { layoutTree } from "./layout"
import { type TreeRoot, TreeRootSchema } from "./node"
import { NODE_SHAPE } from "./shape"
import { NODE_SIZE } from "./size"

// setting は、そのページで効いている設定の値を読む関数
export function treeFits(catalog: CoreCatalog, page: ItemPage, setting: SettingReader, root?: TreeRoot): boolean {
  const found = root ?? TreeRootSchema.safeParse("root" in page ? page.root : undefined).data
  const paper = paperSize(catalog, page)
  if (!paper) return true
  if (!found) return false
  const grow = setting(GROW)
  const size = setting(NODE_SIZE)
  const shape = setting(NODE_SHAPE)
  return layoutTree(found, grow, paper, size, shape, page.grows !== undefined ? growSidesOf(grow) : undefined).fits
}
