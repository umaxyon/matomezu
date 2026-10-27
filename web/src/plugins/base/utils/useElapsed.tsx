// 経った時間（「〜前」）を、見る人の言語の短い文にする関数を返すフック。段に分けるのは elapsed.ts の elapsedOf（1 分未満は「たった今」、分・時間・昨日・日・日付）。
// 基準の時刻 now は描いたときの時刻で、時間が経っても描き直さない（ダイアログなど、開くたびに描くものに使う）

import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { type Elapsed, elapsedOf } from "./elapsed"

export function useElapsed(): (then: string | Date) => string {
  const t = useMessages(kit)
  const now = new Date()
  const text = (e: Elapsed): string => {
    switch (e.unit) {
      case "now":
        return t("Just now")
      case "minutes":
        return t("{n} min ago", { n: e.n })
      case "hours":
        return t("{n} h ago", { n: e.n })
      case "yesterday":
        return t("Yesterday")
      case "days":
        return t("{n} days ago", { n: e.n })
      case "date":
        return e.thisYear
          ? t("{month}/{day}", { month: e.month, day: e.day })
          : t("{year}/{month}/{day}", { year: e.year, month: e.month, day: e.day })
    }
  }
  return then => text(elapsedOf(then, now))
}
