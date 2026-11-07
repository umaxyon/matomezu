// 鳥の絵のシート（paint.ts が色を塗ったもの）を受け取るフック
import { useEffect, useState } from "react"
import type { Bird } from "."
import { birdColors } from "./colors"
import { birdSheet, paintedSheet, sheetKey } from "./paint"

// 鳥 bird に配色 palette（BIRD_PALETTES の id。無ければ元の配色）を塗ったシートの URL。塗り終わるまでは null
export function useBirdSheet(bird: Bird, palette?: string): string | null {
  const colors = birdColors(bird, palette)
  const key = sheetKey(bird, colors)
  const [done, setDone] = useState<{ key: string; url: string } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: key が colors と bird を表す
  useEffect(() => {
    let alive = true
    birdSheet(bird, colors).then(url => {
      if (alive) setDone({ key, url })
    })
    return () => {
      alive = false
    }
  }, [key])
  return paintedSheet(key) ?? (done?.key === key ? done.url : null)
}
