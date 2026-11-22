// 認可ステップに渡す物のうち、問いと確かめの値のほかの物: レコードの読み口（ステップが reads で宣言した種類だけ）と、ブックのバックヤードの印と workKey。
// どちらも、アクションを行う文脈（ctx）が持つ読み口と書庫のフォルダから引く（画面の問いで文脈に無ければ、読み口は none と空、バックヤードは無い）
import type { CoreCatalog } from "./core-catalog"
import type { PermissionDef, PermissionInput } from "./def/permission"
import { backyardEntryOf } from "./entries"
import type { BackyardEntry, Folders } from "./folders"
import { readerOf, sourceIn } from "./record-source"

// アクションの文脈に、行う前の書庫のフォルダを持たせる鍵（run を書くプラグインには見せない。core の中だけで引く）
export const FOLDERS: unique symbol = Symbol("library folders")
export type WithFolders = { [FOLDERS]?: Folders }
export const foldersIn = (ctx: object): Folders | undefined => (ctx as WithFolders)[FOLDERS]

// 認可ステップ p に渡す物: 機能台帳と、文脈 ctx の読み口から p が宣言した種類だけを読む読み口
export const inputFor = (catalog: CoreCatalog, ctx: object, p: PermissionDef): PermissionInput => ({
  catalog,
  read: readerOf(catalog, sourceIn(ctx), p.readsSubjects?.(catalog) ?? []),
})

// 文脈 ctx の書庫で、ブック book がバックヤードに直に在るときの印と workKey
export const backyardEntryIn = (ctx: object, book: string): BackyardEntry | undefined => {
  const folders = foldersIn(ctx)
  return folders ? backyardEntryOf(folders, book) : undefined
}
