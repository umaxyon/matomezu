// 書庫アピアランスの定義: スクリーンの中で書庫を見せる所の種類 1 つ。持ち主のプラグイン状態（と、宣言した種類のレコード）から、今見せているフォルダを答える（描かずに決まる）。置き場は store 台帳。
// スクリーンの定義が libraryAppearances で名指し、土台は、見えているスクリーンが今見せていると答えた物に聞いて、AI とほかの窓の書庫の変更が見えたかを決める
import type { LibraryAppearanceExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Folders } from "../folders"
import type { RecordReader } from "../record-source"
import type { PluginStateRead } from "./plugin-state"

export interface LibraryAppearanceDef extends LibraryAppearanceExtras {
  id: string // 本当の id（例: @matomezu/base:library）
  // shownFolders の records で読むレコードの種類（書かなければ、どの種類も読まない）
  readsSubjects?(catalog: CoreCatalog): readonly string[]
  // 中身を並べて見せているフォルダの id（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）。read は、聞かれたスクリーンの、持ち主のプラグイン状態を読む
  // （ほかのプラグインの宣言は E125）。records は、readsSubjects に書いた種類のレコードを読む（ほかは none と空）。catalog は機能台帳。描いている物と同じに答える
  shownFolders(folders: Folders, read: PluginStateRead, records: RecordReader, catalog: CoreCatalog): readonly string[]
}
