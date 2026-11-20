// ページを変える: アクション page-update（ページの名前と、紙・向き・可変ページか、タイプが選んだページの設定の項目（plugins/base/book-settings）と、タイプがページに足したフィールド（page-fields.ts））

import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import { GROW_CHOICES, ORIENTATIONS } from "../../../core/def/paper"
import type { ItemPage } from "../../../core/placed"
import { withPageSettings } from "../book-look/page-settings"
import { settingsArgs, tidyPage } from "../book-settings"
import { kit } from "../kit"
import { growsValue, withGrows } from "../place/grow"
import { contentIdMaker } from "../utils/ids"
import { fieldsArgs, writeFields } from "./page-fields"
import { pageProblem } from "./page-problems"
import { canChoose, typePaperChoices } from "./pages"

const ARGS = z.strictObject({
  title: z.string().trim().min(1).optional(),
  paper: z.string().min(1).optional(), // 紙の id
  orientation: z.enum(ORIENTATIONS).optional(),
  grows: z.union([z.boolean(), z.enum(GROW_CHOICES)]).optional(), // 可変ページにするか、選んだ増やす向き（place/grow.ts の growsValue）
  settings: z.record(z.string(), z.unknown()).optional(), // ページのタイプが足す項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // ページのタイプがページに足したフィールド（形はタイプが決める）
})

// ページ page の、渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。
// 紙と向きはタイプの規定の中から選ぶ（バインダの中のページが同じバインダのほかのページとそろうかは、ブックの決まりが確かめる）。可変ページはタイプが増やす向きの決め方を持つときだけで、向きはタイプが選べるものの中から。
// 形が紙からはみ出すなら、ノーマライズステップ（variable-pages.ts）が断る（可変ページの広さは、紙の大きさで区切った印刷区画を増やして決まる）。
// settings はページのタイプが選んだ項目だけ（null は消す。形に合わない・選んでいないタイプなら断る）。設定を変えたらページを整える（tidyPage）。
// fields はタイプがページに足したフィールドだけで、受け方はタイプが決められる（決めていなければ、書いたフィールドを丸ごと替える。形に合わない・フィールドの無いタイプなら断る）。
// 受け方が結果を返せば、結果の fields に入れて返す。変えたページにタイプが問題を知らせれば断る（page-problems.ts）
export const PAGE_UPDATE = kit.defineAction({
  id: "page-update",
  attach: { pages: true },
  aiDescription:
    "Change a page: title (not empty), paper and orientation (among the page type's; refused if the page's shapes would not fit), grows (the ways to grow by whole papers or true, as in page-add; false keeps it to one paper; refused if the shapes would not fit), fields (the page's own fields its page type adds, each replaced whole unless its page type says otherwise; what the page type returns comes back in fields) and settings, the ones its page type has (keyed by the setting's id; for a drawing, @matomezu/line:line-route: how its lines run when they have no route of their own, straight or elbow). Only what is given changes; null removes a setting (it then takes its default). The type of a page cannot be changed.",
  title: "Update page",
  target: "page",
  args: ARGS,
  describeArgs: catalog =>
    ARGS.extend({
      settings: settingsArgs(catalog).optional(),
      fields: fieldsArgs(catalog, "update").optional(),
    }),
  permissionScope: "page",
  run: (found, args, ctx) => {
    const written = writeFields(ctx.catalog, found, args.fields, "update", contentIdMaker(found, ctx.newId))
    if (!written) return null
    const papered = withPaper(ctx.catalog, written.page, args)
    if (!papered) return null
    const page = { ...papered, ...(args.title === undefined ? {} : { title: args.title }) }
    const result = written.result === undefined ? {} : { fields: written.result }
    const set = args.settings === undefined ? page : withPageSettings(ctx.catalog, page, args.settings)
    if (!set) return null
    const next = args.settings === undefined ? page : tidyPage(ctx.catalog, set)
    if (pageProblem(ctx.catalog, next)) return null
    return { next, result }
  },
})

// ページ page の紙・向き・可変ページかを args のとおりにしたもの（どれも渡さなければ page のまま）。選べない紙・向き・増やす向き、可変ページを作れないタイプなら null
function withPaper(catalog: CoreCatalog, page: ItemPage, args: z.infer<typeof ARGS>): ItemPage | null {
  if (args.paper === undefined && args.orientation === undefined && args.grows === undefined) return page
  const choice = { paper: args.paper ?? page.paper, orientation: args.orientation ?? page.orientation }
  if (!canChoose(typePaperChoices(catalog, page.type), choice)) return null
  const grows = args.grows === undefined ? page.grows : growsValue(catalog, page.type, args.grows)
  if (grows === null) return null
  // 中身のずらしと、形が紙に入るかの確かめは、ノーマライズステップ（variable-pages.ts）がする
  return withGrows({ ...page, ...choice }, grows)
}
