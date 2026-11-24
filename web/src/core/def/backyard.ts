// バックヤードの定義: 書庫の一番上の、書庫の画面にも AI の一覧にも出ないフォルダ 1 つ（読めない物のフォルダと違い、中の物は書庫に入る。ブックだけを持つ）。プラグインが足し、足したプラグインが持ち主になる。
// 行は印 backyard（この定義の id）を持ち、id は core/folders.ts の backyardIdOf で決まる。足りない行は core の読む関数が足す。
// 定義が機能台帳に無い間も、行と中身はデータに残る。ビルトインプラグインだけが足せる（台帳アセンブルが断る。E319）
import type { BackyardExtras } from "../catalog"

export interface BackyardDef extends BackyardExtras {
  id: string // 本当の id（例: @matomezu/base:tickets-history）
  // 中のブックを、そのブックの workKey が指すレコードの全文（read_records）に添えて AI に見せるか（書いた物だけ。一覧には出さない）
  aiShown?: true
}

export function defineBackyard<const Id extends string>(def: BackyardDef & { id: Id }): BackyardDef & { id: Id } {
  return def
}
