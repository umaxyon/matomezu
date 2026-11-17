// スクリーンアレンジメント「上下に分ける」（SPLIT_ROWS）と、分けて並べるスクリーンの並びを決める純粋な関数。
// 値は、分けて並べるスクリーンの id の並び（上から）と、並びから外したが閉じられずに開いたままの物（behind。新しい順。コントロールセンターなど）。
// 見えているのは、カレントスクリーンがその並びにあれば並び全部、無ければカレントスクリーンだけ
// （分けている間に巣箱でブックスクリーンへ行けば、ブックスクリーンだけ。戻れば、また分けて見せる）。生きている物が 2 枚に満たない並びは、分けていない物として扱う。
// 並びから外れたスクリーンは閉じる（閉じられない物は土台が残す: 最初から開いているスクリーンの最後の 1 枚・最後の 1 枚のブックスクリーン）。
// 並べる枚数の上限は、開く側が決める（max）
import { z } from "zod"
import type { OpenedScreen } from "../../../core/window"
import { kit } from "../kit"

// 分けて並べるのに要る、窓の高さ（px。これより低ければ分けずに開き、分けている間に低くなれば畳む）
export const SPLIT_MIN_HEIGHT = 800

const SPLIT_VALUE = z.strictObject({ screens: z.array(z.string()), behind: z.array(z.string()) })
export type SplitValue = z.output<typeof SPLIT_VALUE>
export const NO_SPLIT: SplitValue = { screens: [], behind: [] }

// 値の、並びから外したが開いたままの物（開いている物だけ）
export function behindOf(screens: readonly Pick<OpenedScreen, "id">[], value: unknown): readonly string[] {
  const fits = SPLIT_VALUE.safeParse(value)
  return fits.success ? fits.data.behind.filter(id => screens.some(s => s.id === id)) : []
}

// 開いているスクリーンの並びのうち、生きている物（開いている・重ならない）
export function splitOf(screens: readonly Pick<OpenedScreen, "id">[], value: unknown): readonly string[] {
  const fits = SPLIT_VALUE.safeParse(value)
  if (!fits.success) return []
  const alive = fits.data.screens.filter((id, i, list) => list.indexOf(id) === i && screens.some(s => s.id === id))
  return alive.length >= 2 ? alive : []
}

// 見えているスクリーン: カレントスクリーンが分けた並びにあれば並び全部、無ければカレントスクリーンだけ
export function splitShown(
  screens: readonly Pick<OpenedScreen, "id">[],
  order: readonly string[],
  value: unknown,
): readonly string[] {
  const current = order[order.length - 1]
  const split = splitOf(screens, value)
  if (current !== undefined && split.includes(current)) return split
  return current === undefined ? [] : [current]
}

// 窓の今のスクリーンアレンジメント（定義の id と値）で、上下に分けて見せている並び（分けて見せていなければ空。カレントスクリーンが並びに無いときも空）
export function shownSplit(
  screens: readonly Pick<OpenedScreen, "id">[],
  order: readonly string[],
  arrangement: { id: string; value: unknown },
): readonly string[] {
  if (arrangement.id !== SPLIT_ROWS.id) return []
  const current = order[order.length - 1]
  const split = splitOf(screens, arrangement.value)
  return current !== undefined && split.includes(current) ? split : []
}

export const SPLIT_ROWS = kit.defineScreenArrangement({
  id: "split-rows",
  title: "Split into rows",
  aiDescription:
    "Shows the screens split into rows, from the top, while the current screen is one of them; otherwise only the current screen.",
  value: { schema: SPLIT_VALUE, initial: NO_SPLIT },
  shown: splitShown,
})

// 分けた並びの変わり: 次の並び（2 枚に満たなければ分けない）と、並びから外れて閉じるスクリーン
export interface SplitPlan {
  screens: readonly string[]
  leaving: readonly string[]
}

// スクリーン here（分けていなければ here だけの並びとみなす）を起点に、開いたスクリーン added を入れる。
// how: after（here の後ろ・下）・before（前・上）・in-place（here の代わり。here は外れる）。並びが max を超えたら、here と added のほかを、here から遠い物から外す
export function planOpen(
  split: readonly string[],
  here: string,
  added: string,
  how: "after" | "before" | "in-place",
  max: number,
): SplitPlan {
  const now = split.includes(here) ? split : [here]
  const at = now.indexOf(here)
  const next =
    how === "in-place"
      ? now.map(id => (id === here ? added : id))
      : [...now.slice(0, how === "after" ? at + 1 : at), added, ...now.slice(how === "after" ? at + 1 : at)]
  const over = Math.max(0, next.length - Math.max(2, max))
  const pivot = next.includes(here) ? next.indexOf(here) : at
  const far = next
    .filter(id => id !== here && id !== added)
    .sort((a, b) => Math.abs(next.indexOf(b) - pivot) - Math.abs(next.indexOf(a) - pivot))
    .slice(0, over)
  const screens = next.filter(id => !far.includes(id))
  const leaving = [...far, ...(how === "in-place" ? [here] : [])]
  return { screens, leaving }
}

// 分けた並びの index 番目（上から）を、開いたスクリーン added に替える（そこにあった物は外れる）
export function planAt(split: readonly string[], index: number, added: string): SplitPlan {
  const was = split[index]
  if (was === undefined) return { screens: split, leaving: [] }
  return { screens: split.map((id, i) => (i === index ? added : id)), leaving: [was] }
}

// 分けた並びから target を閉じる。残りが 1 枚なら、並びから外したが開いたままの物（behind）のうち、いちばん新しい物を上に戻して分けたままにする（無ければ分けない）
export function planClose(split: readonly string[], behind: readonly string[], target: string): SplitPlan {
  const rest = split.filter(id => id !== target)
  if (rest.length !== 1) return { screens: rest, leaving: [target] }
  const back = behind.find(id => id !== target)
  return { screens: back === undefined ? [] : [back, ...rest], leaving: [target] }
}

// 分けた並びから here だけを残す（ほかは閉じる）。窓が低くなって畳むときは、here がカレントスクリーン
export const planExpand = (split: readonly string[], here: string): SplitPlan => ({
  screens: [],
  leaving: split.filter(id => id !== here),
})
