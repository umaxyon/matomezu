// ディレクトリ構成図のページが紙に入るか: ページの根（root を渡せばそれ）を並べ、見せる行がどれも紙に収まるか（閉じたフォルダの中身は数えない。描けない紙のページは確かめない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { paperSize } from "../../base"
import { type DirFolder, DirFolderSchema } from "./entry"
import { layoutDir } from "./layout"

export function dirFits(catalog: CoreCatalog, page: ItemPage, root?: DirFolder): boolean {
  const found = root ?? DirFolderSchema.safeParse("root" in page ? page.root : undefined).data
  const paper = paperSize(catalog, page)
  if (!paper) return true
  if (!found) return false
  return layoutDir(found, paper).fits
}
