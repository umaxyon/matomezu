// 新しい版を自動で確かめる: 常駐が、立ったときと 1 日ごとに、npm のレジストリに matomezu の新しい版を聞くか（利用者の設定の項目。切っても、利用者が頼めば確かめる）
import { z } from "zod"
import { kit } from "../kit"

export const UPDATE_CHECK = kit.defineSetting({
  id: "update-check",
  title: "Check for updates automatically",
  schema: z.boolean(),
  role: "update-check",
  default: true,
  userOnly: true,
})
