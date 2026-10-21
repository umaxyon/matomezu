// 見る人ごとの設定。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはホームのブックのタイプが決める）
import type { Lang } from "./i18n/i18n"
import type { KeyChanges } from "./keys"

// keys は配置と別の段に持つ（配置を替えても残る）
export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
  keys: KeyChanges // キーの割り当ての、利用者の変更
}
