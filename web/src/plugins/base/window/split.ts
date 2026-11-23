// スクリーンアレンジメント「上下に分ける」（SPLIT_ROWS）と、分けて並べるスクリーンの並びを決める純粋な関数。
// 値は、分けて並べるスクリーンの id の並び（上から）と、並びから外したが閉じられずに開いたままの物（behind。新しい順。コントロールセンターなど）と、
// 並びを覚えたまま窓いっぱいに広げているスクリーン（wide。下の行の □）。
// ステージを並べるスクリーン（ブックスクリーン）も並びに入る（ステージを分けて、下に書庫のスクリーンを出すとき）。並びから外れても閉じない（applySplit）。
// 見えているのは、カレントスクリーンがその並びにあれば並び全部（広げている間は、カレントスクリーンだけ）、無ければカレントスクリーンだけ
// （分けている間に巣箱のコマンドでブックスクリーンへ行けば、ブックスクリーンだけ。戻れば、また分けて見せる）。生きている物が 2 枚に満たない並びは、分けていない物として扱う。
// 並びから外れたスクリーンは閉じる（閉じられない物は土台が残す: 最初から開いているスクリーンの最後の 1 枚）。
// 並べる枚数の上限は、開く側が決める（max）
import { z } from "zod"
import type { OpenedScreen } from "../../../core/window"
import { kit } from "../kit"

// スクリーンの枠を一瞬光らせる頼み（窓のプラグイン状態。画面の場所に入れない）: 光らせるスクリーンの id と、頼んだ回数（同じスクリーンを続けて頼んでも光り直す）
export const SCREEN_FLASH = kit.definePluginStateOf<{ screen: string; n: number }>()({
  id: "screen-flash",
  scope: "window",
})

// 分けて並べるのに要る、窓の高さ（px。これより低ければ分けずに開き、分けている間に低くなれば畳む）
export const SPLIT_MIN_HEIGHT = 800

// fits は、窓の高さで並べて見せられるか（"split" か、低くてカレントスクリーンだけを見せている "current"。ブックスクリーンを入れた並びは、低くても畳まずに "current" にする）
const SPLIT_VALUE = z.strictObject({
  screens: z.array(z.string()),
  behind: z.array(z.string()),
  fits: z.enum(["split", "current"]).optional(),
  // 並びのうち、窓いっぱいに広げて見せているスクリーン（下の行の □。並びは覚えたまま、もう一度押すと戻す）
  wide: z.string().optional(),
})
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
  const fits = SPLIT_VALUE.safeParse(value)
  if (current !== undefined && split.includes(current) && fits.data?.fits !== "current" && !widened(split, value))
    return split
  return current === undefined ? [] : [current]
}

// 並び split のうち、窓いっぱいに広げているスクリーン（広げていなければ undefined）
export function wideOf(split: readonly string[], value: unknown): string | undefined {
  const wide = SPLIT_VALUE.safeParse(value).data?.wide
  return wide !== undefined && split.includes(wide) ? wide : undefined
}
const widened = (split: readonly string[], value: unknown) => wideOf(split, value) !== undefined

// 窓の今のスクリーンアレンジメント（定義の id と値）で、上下に分けて見せている並び（分けて見せていなければ空。カレントスクリーンが並びに無いときも空）
export function shownSplit(
  screens: readonly Pick<OpenedScreen, "id">[],
  order: readonly string[],
  arrangement: { id: string; value: unknown },
): readonly string[] {
  if (arrangement.id !== SPLIT_ROWS.id) return []
  const current = order[order.length - 1]
  const split = splitOf(screens, arrangement.value)
  return current !== undefined && split.includes(current) && !widened(split, arrangement.value) ? split : []
}

export const SPLIT_ROWS = kit.defineScreenArrangement({
  id: "split-rows",
  title: "Split into rows",
  aiDescription:
    "Shows the screens split into rows, from the top, while the current screen is one of them; otherwise only the current screen. While one of the rows is widened, only the current screen is shown and the rows are kept to restore.",
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

// ブックスクリーンを「分割で開く」ときの入れ方: 分けていなければ起点の下。分けていれば、起点を替える（keepHere が false）か、
// 起点を残してもう片方の段を替える（keepHere が true。起点が上なら下、下なら上）。index は起点の並びの中の位置
export function bookSplitWay(inSplit: boolean, index: number, keepHere: boolean): "after" | "before" | "in-place" {
  if (!inSplit) return "after"
  if (!keepHere) return "in-place"
  return index > 0 ? "before" : "after"
}

// 分けた並びの index 番目（上から）を、開いたスクリーン added に替える（そこにあった物は外れる）
export function planAt(split: readonly string[], index: number, added: string): SplitPlan {
  const was = split[index]
  if (was === undefined) return { screens: split, leaving: [] }
  return { screens: split.map((id, i) => (i === index ? added : id)), leaving: [was] }
}

// 分けた並びから target を閉じる。残りが 1 枚なら、並びから外したが開いたままの物（behind）のうち、いちばん新しい物を上に戻して分けたままにする（無ければ分けない）。
// 残りの 1 枚がステージを並べるスクリーン（stages に在る物）で、behind が 2 枚以上なら（ステージを分ける前の並び）それに戻し、無ければ分けるのをやめる。
// 閉じた物もステージを並べるスクリーンで、behind が 1 枚なら（その段に開いて替えた物）、ほかと同じく上に戻す
export function planClose(
  split: readonly string[],
  behind: readonly string[],
  target: string,
  stages: readonly string[] = [],
): SplitPlan {
  const rest = split.filter(id => id !== target)
  if (rest.length !== 1) return { screens: rest, leaving: [target] }
  // ブックスクリーンどうしの並びで片方を閉じたときは、behind の 1 枚（その段に開いて替えた物）を上に戻す
  const bookPair = stages.includes(target) && behind.length === 1
  if (rest[0] !== undefined && stages.includes(rest[0]) && !bookPair)
    return { screens: behind.length >= 2 ? behind : [], leaving: [target] }
  const back = behind.find(id => id !== target)
  return { screens: back === undefined ? [] : [back, ...rest], leaving: [target] }
}

// 並びの値 value に、窓いっぱいに広げるスクリーン wide を書いた値（wide が無ければ、広げるのをやめた値）
export function withWide(value: unknown, wide: string | undefined): SplitValue {
  const fits = SPLIT_VALUE.safeParse(value)
  const { wide: _, ...rest } = fits.success ? fits.data : NO_SPLIT
  return wide === undefined ? rest : { ...rest, wide }
}

// 分けた並びを全部外す（並びのブックスクリーンは、外したあとに閉じる側が閉じる）
export const planLeaveAll = (split: readonly string[]): SplitPlan => ({ screens: [], leaving: split })

// 分けた並びから here だけを残す（ほかは閉じる）。窓が低くなって畳むときは、here がカレントスクリーン
export const planExpand = (split: readonly string[], here: string): SplitPlan => ({
  screens: [],
  leaving: split.filter(id => id !== here),
})
