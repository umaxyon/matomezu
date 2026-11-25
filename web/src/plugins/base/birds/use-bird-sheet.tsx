// 鳥の絵のシート（paint.tsx が色を塗ったもの）を受け取るフック
import { useEffect, useState } from "react"
import type { Bird } from "."
import { birdColors } from "./colors"
import { birdFace, birdSheet, type FaceEyes, faceKey, paintedSheet, sheetKey } from "./paint"

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

// 鳥 bird の顔の丸い絵（配色 palette を塗ったもの。ポインタと送信トレイの行）の URL。塗り終わるまでは null
export function useBirdFace(bird: Bird, palette?: string, eyes: FaceEyes = "open"): string | null {
  const colors = birdColors(bird, palette)
  const key = faceKey(bird, colors, eyes)
  const [done, setDone] = useState<{ key: string; url: string } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: key が colors と bird を表す
  useEffect(() => {
    let alive = true
    birdFace(bird, colors, eyes).then(url => {
      if (alive) setDone({ key, url })
    })
    return () => {
      alive = false
    }
  }, [key])
  return paintedSheet(key) ?? (done?.key === key ? done.url : null)
}
