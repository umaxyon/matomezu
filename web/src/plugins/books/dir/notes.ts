// 説明の見せ方: ページの設定の項目 notes で持つ。説明を出すか（既定は出す）・説明の前に「・・・」を付けるか・説明の列と行の間に、紙を縦に分ける区切り線を引くか（既定はどちらも付けない）
import { z } from "zod"
import { kit } from "./kit"

// 説明の見せ方（layout.ts が使う）
export const NoteLookSchema = z.object({ shown: z.boolean(), dots: z.boolean(), divider: z.boolean() })
export type NoteLook = z.infer<typeof NoteLookSchema>

export const NOTE_DEFAULT: NoteLook = { shown: true, dots: false, divider: false }

export const NOTES = kit.defineSetting({
  id: "notes",
  title: "Show descriptions",
  schema: NoteLookSchema,
  default: NOTE_DEFAULT,
})

// そのページで効いている設定の値を読む関数 setting から、説明の見せ方を決める（読めない値は既定）
export const noteLookOf = (setting: (id: string) => unknown): NoteLook =>
  NoteLookSchema.safeParse(setting(NOTES.id)).data ?? NOTE_DEFAULT
