// 読めない物のフォルダを書庫のツリーに出すかの利用者の設定の項目（既定は出さない）
import { z } from "zod"
import { kit } from "../kit"

export const SHOW_UNREADABLE_FOLDER = kit.defineSetting({
  id: "show-unreadable-folder",
  title: "Show the unreadable folder",
  schema: z.boolean(),
  default: false,
  userOnly: true, // 読めない物のフォルダは AI に見せないので、AI が読む設定にも出さず、AI に変えさせない
})
