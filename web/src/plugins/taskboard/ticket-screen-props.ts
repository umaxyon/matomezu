// チケットスクリーンを開くときの値の形: チケットの id（URL から来る値を確かめる）
import { z } from "zod"

export const TICKET_SCREEN_PROPS = z.strictObject({ ticket: z.string().min(1) })
