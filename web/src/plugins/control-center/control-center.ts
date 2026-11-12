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

// コントロールセンターの中で前に出す画面（場所に入れる画面の状態の宣言。窓の外の値で、変えるたびにブラウザの履歴に積む）。
// 値は、プロジェクトの画面（projects）か書庫の画面（library）。値が無ければ今の画面（参加者リストの 1 つ）を出す。切り替える画面と操作は、画面を作る段で足す
export const FRONT_SCREEN = kit.definePlacedState({
  id: "front-screen",
  scope: "frame",
  schema: z.enum(["projects", "library"]),
  browserHistory: "push",
})
