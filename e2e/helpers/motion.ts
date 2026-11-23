// スクリーンの動きを確かめる物: 動きの途中の位置を、コマごとに記録する
import { expect, type Locator, type Page } from "@playwright/test"
import { afterFrames } from "./frames"

export interface Box {
  left: number
  top: number
  height: number
}

// 動きが始まって（どれかが最初の位置から変わって）止まるまで、コマごとに probes の物（見えている最初の 1 つ）の位置を記録する
export const track = <K extends string>(page: Page, probes: Record<K, string>): Promise<Record<K, Box | null>[]> =>
  page.evaluate<Record<K, Box | null>[], Record<string, string>>(
    (probes: Record<string, string>) =>
      new Promise<Record<K, Box | null>[]>(done => {
        const out: Record<K, Box | null>[] = []
        let began = false
        let still = 0
        const step = () => {
          const frame = {} as Record<K, Box | null>
          for (const [name, selector] of Object.entries(probes)) {
            const el = [...document.querySelectorAll<HTMLElement>(selector)].find(
              e => getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none",
            )
            const r = el?.getBoundingClientRect()
            frame[name as K] = r ? { left: r.left, top: r.top, height: r.height } : null
          }
          out.push(frame)
          // 何かが最初の位置から動いたら始まり、動き（CSS の transition・animation）が無くなったら止まり
          if (JSON.stringify(frame) !== JSON.stringify(out[0])) began = true
          // 動きが無く、位置が 5 コマ続けて変わらなければ止まり
          const moving = document.getAnimations().some(x => x.playState === "running")
          const prev = out[out.length - 2]
          still = !moving && prev !== undefined && JSON.stringify(frame) === JSON.stringify(prev) ? still + 1 : 0
          if (began && still >= 5) done(out)
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    probes,
  )

// locator の位置と大きさが、2 コマ続けて変わらなくなるまで待って返す（スクリーンが滑り込む・縮む間に測らない）
export async function stillBox(locator: Locator) {
  let last = JSON.stringify(await locator.boundingBox())
  await expect
    .poll(async () => {
      await afterFrames(locator.page())
      const now = JSON.stringify(await locator.boundingBox())
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  return (await locator.boundingBox())!
}
