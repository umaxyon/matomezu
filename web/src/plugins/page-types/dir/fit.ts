// ディレクトリ構成図のページが紙に入るか: ページの根（root を渡せばそれ）を並べ（grow はページの増やす向き。可変ページでなければ undefined）、見せる行がどれも紙に収まるか（閉じたフォルダの中身は数えない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type GrowSides, paperSize } from "../../base"
import { layoutDir } from "./layout"
import { type DirFolder, dirRootOf } from "./node"

export function dirFits(catalog: CoreCatalog, page: ItemPage, grow: GrowSides | undefined, root?: DirFolder): boolean {
  const found = root ?? dirRootOf(page)
  const paper = paperSize(catalog, page)
  if (!found) return false
  return layoutDir(found, paper, undefined, grow !== undefined).fits
}
