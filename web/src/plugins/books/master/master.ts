// マスターのブック: ブックの一覧や設定などを集める、紙もページも無い画面。名前はタイプの名前で呼ぶ（題名を持たない）。
// インスタンスのホームにすると、ブックの一覧と設定を変えるアクション（book-create・settings-set など）を許すかは、このタイプが決める
import { z } from "zod"
import { kit } from "./kit"

// マスターの見せ方: ブックの一覧などを並べる画面
export const MASTER_PRESENTATION = kit.definePresentation({ id: "master" })

export const MASTER = kit.defineBookType({
  id: "master",
  version: 1,
  title: "Master",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: true,
  book: {},
  pages: null,
  items: { allowed: [] },
  // ブックの一覧と設定を変えるアクションを足し、名前の入力Formを出さないので book-update を外す
  actions: {
    add: [
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
    ],
    without: ["@matomezu/base:book-update", "@matomezu/base:book-lock", "@matomezu/base:book-unlock"],
  },
  // マスターの物はブックのリンクで、図の物ではないので伝言もマークも付けない
  annotations: { without: ["@matomezu/base:note", "@matomezu/base:mark"] },

  theme: "@matomezu/base:standard",
  presentation: MASTER_PRESENTATION.id,
  tokens: [],
})

export const MASTER_BOOK = MASTER.book
