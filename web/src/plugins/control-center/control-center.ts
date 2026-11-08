// コントロールセンター: ブックの一覧・利用者の設定・郵便箱・参加者の表を変えるアクションを許す。
// 組織ごとのコントロールセンターは、このプラグインの代わりに自分のものを渡す
import { kit } from "./kit"

export const CONTROL_CENTER = kit.defineControlCenter({
  id: "control-center",
  actions: [
    "@matomezu/base:book-create",
    "@matomezu/base:book-trash",
    "@matomezu/base:book-restore",
    "@matomezu/base:book-purge",
    "@matomezu/base:trash-empty",
    "@matomezu/base:settings-set",
    "@matomezu/base:mail-send",
    "@matomezu/base:mail-seen",
    "@matomezu/base:mail-visited",
    "@matomezu/base:mail-remove",
    "@matomezu/base:mail-join-request",
    "@matomezu/base:participant-request",
    "@matomezu/base:participant-accept",
    "@matomezu/base:participant-decline",
  ],
})
