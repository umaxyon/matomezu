// コントロールセンター: ブックの一覧・利用者の設定・郵便箱・対象の定義の種類を変えるアクションを許す。
// 組織ごとのコントロールセンターは、このプラグインの代わりに自分のものを渡す
import { z } from "zod"
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
    "@matomezu/base:proposal-send",
    "@matomezu/base:proposal-settle",
    "@matomezu/base:mail-join-request",
  ],
  subjects: "all",
})

// コントロールセンターの中で前に出す画面（画面の場所に入れるプラグイン状態。ステージに結ばない値で、変えるたびにブラウザの履歴に積む）。
// 値は、プロジェクトの画面（projects）か書庫の画面（library）。値が無ければ、参加者リストの画面を出す
export const FRONT_SCREEN = kit.definePluginState({
  id: "front-screen",
  scope: "window",
  schema: z.enum(["projects", "library"]),
  address: "push",
})
