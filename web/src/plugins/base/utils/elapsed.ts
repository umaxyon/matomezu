// 経った時間（「〜前」）: 時刻 then から今 now までを、出し方の段に分ける（どこでも使う共通の計算。追加プラグインには matomezu から出す）。
// 言葉にするのは見た目の側（useElapsed）。
// 1 分未満は今、1〜59 分は分、1〜23 時間は時間、それより前は暦の日（見る人の時間帯）で、前日は昨日、2〜6 日前は日、それより前は日付。
// 先の時刻（時計のずれ）は今として扱う

export type Elapsed =
  | { unit: "now" }
  | { unit: "minutes"; n: number }
  | { unit: "hours"; n: number }
  | { unit: "yesterday" }
  | { unit: "days"; n: number }
  | { unit: "date"; year: number; month: number; day: number; thisYear: boolean }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// 暦の日の始まり（見る人の時間帯）
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function elapsedOf(then: string | Date, now: Date): Elapsed {
  const at = typeof then === "string" ? new Date(then) : then
  const ms = now.getTime() - at.getTime()
  if (!Number.isFinite(ms) || ms < MINUTE) return { unit: "now" }
  if (ms < HOUR) return { unit: "minutes", n: Math.floor(ms / MINUTE) }
  if (ms < 24 * HOUR) return { unit: "hours", n: Math.floor(ms / HOUR) }
  const days = Math.round((dayOf(now) - dayOf(at)) / (24 * HOUR))
  if (days <= 1) return { unit: "yesterday" }
  if (days <= 6) return { unit: "days", n: days }
  return {
    unit: "date",
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
    thisYear: at.getFullYear() === now.getFullYear(),
  }
}
