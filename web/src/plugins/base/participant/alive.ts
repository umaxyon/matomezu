// 参加の有効時間: 参加者が最後に呼ばれてから、その参加者を「生きている」とする長さ（利用者の設定の項目。生きているかの判定は core/settings.ts の isParticipantAlive）
import { z } from "zod"
import { kit } from "../kit"

// 選べる有効時間: 分の数
export const PARTICIPANT_ALIVE_CHOICES = ["15", "30", "60", "120", "480"] as const
export const PARTICIPANT_ALIVE = kit.defineSetting({
  id: "participant-alive",
  title: "Participation lasts",
  schema: z.enum(PARTICIPANT_ALIVE_CHOICES),
  role: "participant-alive",
  default: "60",
  optionTitles: {
    "15": kit.message("15 minutes"),
    "30": kit.message("30 minutes"),
    "60": kit.message("60 minutes"),
    "120": kit.message("2 hours"),
    "480": kit.message("8 hours"),
  },
})
