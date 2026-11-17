// ソースのペインの見た目の利用者の設定の項目: 行番号を出すか（既定は出す）、カーソルのある行に下線を引くか、空白（半角・全角・Tab）を印で見せるか。
// どれも字を足さずに、テキストFormの下の写しに重ねて描く（view/SourcePane.tsx）
import { z } from "zod"
import { kit } from "./kit"

export const LINE_NUMBERS = kit.defineSetting({
  id: "line-numbers",
  title: "Line numbers",
  schema: z.boolean(),
  default: true,
})

export const CURRENT_LINE = kit.defineSetting({
  id: "current-line",
  title: "Underline the current line",
  schema: z.boolean(),
  default: false,
})

export const SHOW_WHITESPACE = kit.defineSetting({
  id: "show-whitespace",
  title: "Show spaces and tabs",
  schema: z.boolean(),
  default: false,
})

export const SOURCE_LOOK_SETTINGS = [LINE_NUMBERS, CURRENT_LINE, SHOW_WHITESPACE] as const
