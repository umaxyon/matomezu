// 窓が、上下に分けて並べられる高さ（SPLIT_MIN_HEIGHT 以上）か。ビューのフックと、base のコマンドが読む
import { SPLIT_MIN_HEIGHT } from "./split"

const TALL = `(min-height: ${SPLIT_MIN_HEIGHT}px)`

// 高さが分けられるかどうかの境を越えたら changed を呼ぶ（やめる関数を返す）
export const subscribeTall = (changed: () => void) => {
  if (typeof matchMedia !== "function") return () => {}
  const query = matchMedia(TALL)
  query.addEventListener("change", changed)
  return () => query.removeEventListener("change", changed)
}

// 今の窓が、分けて並べられる高さか（窓の無い所では false）
export const tallNow = () => typeof matchMedia === "function" && matchMedia(TALL).matches
