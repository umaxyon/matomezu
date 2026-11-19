// システムフォルダの定義: 書庫ホームの直下に、いつも先頭に在るフォルダの種類 1 つ（base のドキュメントなど）。プラグインが種類を足す。
// フォルダの行は印 systemFolder（この定義の id）を持ち、名前は持たない。名前は、この定義の title を利用者の設定の言語で引く（core/entries.ts の rowTitle）。
// 定義が機能台帳に無い間も、行と中身はデータに残る（名前の無い物になる）
import type { SystemFolderExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface SystemFolderDef<Tt extends string = MessageKey> extends SystemFolderExtras {
  id: string // 本当の id（例: @matomezu/base:documents）
  title: Tt // フォルダの名前（文言の鍵）
  aiDescription: string // AI 向けの説明（英語。何を入れるフォルダか）
}

export function defineSystemFolder<const Id extends string>(
  def: SystemFolderDef & { id: Id },
): SystemFolderDef & { id: Id } {
  return def
}
