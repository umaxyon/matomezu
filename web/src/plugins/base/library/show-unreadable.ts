// 読めない物のフォルダを書庫のツリーに出すかの利用者の設定の項目（既定は出さない）
import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import { type Settings, userSetting } from "../../../core/settings"
import { kit } from "../kit"

export const SHOW_UNREADABLE_FOLDER = kit.defineSetting({
  id: "show-unreadable-folder",
  title: "Show the unreadable folder",
  schema: z.boolean(),
  default: false,
  userOnly: true, // 読めない物のフォルダは AI に見せないので、AI が読む設定にも出さず、AI に変えさせない
})

// 利用者の設定 settings で、読めない物のフォルダを書庫のツリーに出すか
export const unreadableShownIn = (catalog: CoreCatalog, settings: Settings): boolean =>
  userSetting(catalog, settings, SHOW_UNREADABLE_FOLDER.id) === true
