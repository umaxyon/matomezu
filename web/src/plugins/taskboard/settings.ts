// 利用者の設定の項目 2 つ（コントロールセンターの左のプロジェクトの一覧）: 並び（プロジェクトの id の並び）と、出しているタスクボード（プロジェクトの id の並び）。
// 変えるのは一覧の見た目（並べ替え・チェック）なので、項目のビューを持たず、値の形（文字の並び）から入力Formも作れないので、利用者の設定の並び（全体設定）には出ない。
// 利用者だけが変える。消したプロジェクトの id は並びに残す（読む側が、無い物を飛ばす）。出しているタスクボードの値が無いこと（まだ選んでいない）と、空の並び（どれも出さない）は区別する
import { z } from "zod"
import { kit } from "./kit"

export const PROJECT_ORDER = kit.defineSetting({
  id: "project-order",
  title: "project order",
  schema: z.array(z.string()),
  default: [],
  userOnly: true,
})

export const SHOWN_PROJECTS = kit.defineSetting({
  id: "shown-projects",
  title: "shown projects",
  schema: z.array(z.string()),
  userOnly: true,
})
