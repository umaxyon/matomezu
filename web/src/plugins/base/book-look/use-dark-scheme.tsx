// ブックの中身の明暗: ブックの中身は利用者の OS の明暗に合わせて描く（ui/theme-vars.ts の light-dark()）ので、
// 色の見本など、色を 1 つに決めて見せる所も同じ明暗の値を選ぶ
import { useSyncExternalStore } from "react"
import type { Shades } from "../../../core/theme"

const DARK = "(prefers-color-scheme: dark)"

const subscribe = (changed: () => void) => {
  const query = typeof matchMedia === "undefined" ? null : matchMedia(DARK)
  query?.addEventListener("change", changed)
  return () => query?.removeEventListener("change", changed)
}
const isDark = () => typeof matchMedia !== "undefined" && matchMedia(DARK).matches

// 今の OS の明暗が暗いか
export const useDarkScheme = (): boolean => useSyncExternalStore(subscribe, isDark, () => false)

// 明暗のある値 shades の、明暗 dark の値
export const shadeOf = (shades: Shades, dark: boolean): string => (dark ? shades.dark : shades.light)
