// クリップボードの包み: 常駐とプラグインの種類で包んで書き、読むときに確かめる（core/clipboard.ts）

import { expect, test } from "bun:test"
import { CLIP_FORMAT, clipboardOn, NO_CLIP_DATA, OTHER_HOST } from "../../web/src/core/clipboard"

const carried = (text?: string) => {
  const data = new Map<string, string>(text === undefined ? [] : [[CLIP_FORMAT, text]])
  return {
    getData: (f: string) => data.get(f) ?? "",
    setData: (f: string, v: string) => void data.set(f, v),
    files: [] as File[],
  }
}
const on = (t: ReturnType<typeof carried>, host = "h", owner = "@a/p") => clipboardOn(t, host, owner, () => false)

test("書いた物は、同じ常駐・同じプラグインの同じ種類で読める。ほかの常駐なら OTHER_HOST", () => {
  const t = carried()
  on(t).write("clip", { n: 1 })
  expect(on(t).read("clip")).toEqual({ n: 1 })
  expect(on(t, "other").read("clip")).toBe(OTHER_HOST)
})

test("種類の違い・ほかのプラグイン・壊れた JSON・data 無し・空は NO_CLIP_DATA", () => {
  const t = carried()
  on(t).write("clip", 1)
  expect(on(t).read("other")).toBe(NO_CLIP_DATA)
  expect(on(t, "h", "@b/q").read("clip")).toBe(NO_CLIP_DATA)
  expect(on(carried("{")).read("clip")).toBe(NO_CLIP_DATA)
  expect(on(carried(JSON.stringify({ host: "h", kind: "@a/p:clip" }))).read("clip")).toBe(NO_CLIP_DATA)
  expect(on(carried()).read("clip")).toBe(NO_CLIP_DATA)
})
