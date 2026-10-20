// 見る人ごとの設定。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはホームのブックのタイプが決める）
import type { Lang } from "./i18n/i18n"

export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
}
