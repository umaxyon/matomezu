// 説明の見せ方: ページの設定の項目で持つ。説明を出すか（既定は出す）・説明の前に「・・・」を付けるか・説明の列と行の間に、紙を縦に分ける区切り線を引くか（既定はどちらも付けない）
import { z } from "zod"
import { kit } from "./kit"

export const NOTES_SHOWN = kit.defineSetting({
  id: "notes-shown",
  title: "Show descriptions",
  schema: z.boolean(),
  default: true,
})
export const NOTE_DOTS = kit.defineSetting({
  id: "note-dots",
  title: "Dots before descriptions",
  schema: z.boolean(),
  default: false,
})
export const NOTE_DIVIDER = kit.defineSetting({
  id: "note-divider",
  title: "Divider before descriptions",
  schema: z.boolean(),
  default: false,
})

// 説明の見せ方（layout.ts が使う）
export interface NoteLook {
  shown: boolean
  dots: boolean
  divider: boolean
}

// そのページで効いている設定の値を読む関数 setting から、説明の見せ方を決める（読めない値は既定）
export const noteLookOf = (setting: (id: string) => unknown): NoteLook => ({
  shown: NOTES_SHOWN.schema.safeParse(setting(NOTES_SHOWN.id)).data ?? true,
  dots: NOTE_DOTS.schema.safeParse(setting(NOTE_DOTS.id)).data ?? false,
  divider: NOTE_DIVIDER.schema.safeParse(setting(NOTE_DIVIDER.id)).data ?? false,
})
