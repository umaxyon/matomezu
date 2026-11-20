// 読めない物のフォルダを書庫のツリーに出すかの利用者の設定の項目（既定は出さない）。出している間、ツリーのゴミ箱の下に、空でも「読めない物」の行が出る
// （出さなくても、中に物が在る間は、ツリーの下の「読めない物 N 件」から開ける）
import { z } from "zod"
import { kit } from "../kit"

export const SHOW_UNREADABLE_FOLDER = kit.defineSetting({
  id: "show-unreadable-folder",
  title: "Show the unreadable folder",
  schema: z.boolean(),
  default: false,
  userOnly: true, // 読めない物のフォルダは AI に見せないので、AI が読む設定にも出さず、AI に変えさせない
})
