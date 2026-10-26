// マスターのブック: ブックの一覧や設定などを集める、紙もページも無い画面。名前はタイプの名前で呼ぶ（題名を持たない）。
// インスタンスのホームにすると、ブックの一覧と設定を変えるアクション（book-create・settings-lang など）を許すかは、このタイプが決める
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
  items: { allowed: [], defaults: [] },
  // ブックの一覧と設定を変えるアクションを足し、名前の欄を出さないので book-update を外す
  actions: {
    add: [
      "@matomezu/master:book-create",
      "@matomezu/base:settings-lang",
      "@matomezu/base:settings-skin",
      "@matomezu/base:settings-keys",
    ],
    without: ["@matomezu/base:book-update"],
  },

  theme: "@matomezu/base:standard",
  presentation: MASTER_PRESENTATION.id,
  tokens: [],
})

export const MASTER_BOOK = MASTER.book
