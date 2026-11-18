// 書庫アピアランスの定義: スクリーンの中で書庫を見せる所の種類 1 つ。持ち主のプラグイン状態から、今見せているフォルダを答える（描かずに決まる）。置き場は store 台帳。
// スクリーンの定義が libraryAppearances で名指し、土台は、見えているスクリーンが今見せていると答えた物に聞いて、AI とほかの窓の書庫の変更が見えたかを決める
import type { LibraryAppearanceExtras } from "../catalog"
import type { Folders } from "../folders"
import type { PluginStateRead } from "./plugin-state"

export interface LibraryAppearanceDef extends LibraryAppearanceExtras {
  id: string // 本当の id（例: @matomezu/base:library）
  // 中身を並べて見せているフォルダの id（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）。read は、聞かれたスクリーンの、持ち主のプラグイン状態を読む
  // （ほかのプラグインの宣言は E125）。描いている物と同じに答える
  shownFolders(folders: Folders, read: PluginStateRead): readonly string[]
}
