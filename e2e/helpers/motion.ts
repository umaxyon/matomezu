// スクリーンの動きを確かめる物: 動きの途中の位置を、コマごとに記録する
import { expect, type Locator, type Page } from "@playwright/test"
import { afterFrames } from "./frames"

export interface Box {
  left: number
  top: number
  height: number
}

// probe の物で、CSS の transition（prop は動かす性質の名前）か animation（prop はその名前）が始まった・終わった知らせ（t は知らせの時刻）
export interface MotionEvent<K extends string> {
  probe: K
  kind: "start" | "end"
  prop: string
  t: number
}

// コマごとの probes の物の位置（frames）と、その間の動きの始まりと終わりの知らせ（events）
export interface Motion<K extends string> {
  frames: Record<K, Box | null>[]
  events: MotionEvent<K>[]
}

// 動きが始まって（どれかが最初の位置から変わって）止まるまで、コマごとに probes の物（見えている最初の 1 つ）の位置を記録する。
// 動きの始まりと終わりの知らせも記録する（重くて 1 コマが動きより長いと途中のコマは取れないが、知らせは届く）
export const track = <K extends string>(page: Page, probes: Record<K, string>): Promise<Motion<K>> =>
  page.evaluate<Motion<K>, Record<string, string>>(
    (probes: Record<string, string>) =>
      new Promise<Motion<K>>(done => {
        const out: Record<K, Box | null>[] = []
        const events: MotionEvent<K>[] = []
        const heard = (kind: "start" | "end") => (e: Event) => {
          const target = e.target
          if (!(target instanceof Element)) return
          const prop = e instanceof TransitionEvent ? e.propertyName : (e as AnimationEvent).animationName
          for (const [name, selector] of Object.entries(probes))
            if (target.matches(selector)) events.push({ probe: name as K, kind, prop, t: e.timeStamp })
        }
        const listeners = [
          ["transitionstart", heard("start")],
          ["animationstart", heard("start")],
          ["transitionend", heard("end")],
          ["transitioncancel", heard("end")],
          ["animationend", heard("end")],
          ["animationcancel", heard("end")],
        ] as const
        for (const [type, listener] of listeners) document.addEventListener(type, listener, true)
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
          if (began && still >= 5) {
            for (const [type, listener] of listeners) document.removeEventListener(type, listener, true)
            done({ frames: out, events })
          } else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    probes,
  )

// probe の物が、動きの途中（midway がその位置で true）を通ったか: 途中のコマが取れたか、prop の動きが始まった知らせがある
// （重くて途中のコマが取れなくても、動きは途中を通っている。動かずに跳んだときは、どちらも無い）
export const passesMidway = <K extends string>(
  motion: Motion<K>,
  probe: K,
  prop: string,
  midway: (box: Box) => boolean,
): boolean =>
  motion.frames.some(f => f[probe] !== null && midway(f[probe])) ||
  motion.events.some(e => e.probe === probe && e.kind === "start" && e.prop === prop)

// probe の物の prop の動きの、最初の始まりか最後の終わりの時刻（無ければ undefined）
export const motionAt = <K extends string>(
  motion: Motion<K>,
  probe: K,
  prop: string,
  kind: "start" | "end",
): number | undefined => {
  const ts = motion.events.filter(e => e.probe === probe && e.prop === prop && e.kind === kind).map(e => e.t)
  if (ts.length === 0) return undefined
  return kind === "start" ? Math.min(...ts) : Math.max(...ts)
}

// locator の位置と大きさが、2 コマ続けて変わらず、その物と先祖に動き（遅れて始まるのを待っている物も）が無くなるまで待って返す
// （スクリーンが滑り込む・縮む間に測らない。上の物が出ていくのを待ってから伸びる物の、待っている間の静止を止まったと見ない）
export async function stillBox(locator: Locator) {
  const moving = () =>
    locator.evaluate(e => {
      for (let n: Element | null = e; n; n = n.parentElement)
        if (n.getAnimations().some(a => a.playState === "running")) return true
      return false
    })
  let last = JSON.stringify(await locator.boundingBox())
  await expect
    .poll(async () => {
      await afterFrames(locator.page())
      const now = JSON.stringify(await locator.boundingBox())
      const same = now === last
      last = now
      return same && !(await moving())
    })
    .toBe(true)
  return (await locator.boundingBox())!
}
