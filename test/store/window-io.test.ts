// インスタンスが受け取る、ブラウザの窓の口（クリップボードに書く・窓のタイトルを替える）
import { expect, test } from "bun:test"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"

test("copyText は渡した口に文字をそのまま渡し、口が無ければ E404 で断る", async () => {
  const written: string[] = []
  const store = createMatomezu({
    plugins: BUILTIN,
    copyText: async text => {
      written.push(text)
    },
  })
  await store.copyText("matomezu open")
  expect(written).toEqual(["matomezu open"])
  await expect(createMatomezu({ plugins: BUILTIN }).copyText("x")).rejects.toMatchObject({ code: "E404" })
})

test("setWindowTitle は渡した口にタイトルを渡し、口が無ければ何もしない", () => {
  const titles: string[] = []
  createMatomezu({ plugins: BUILTIN, setWindowTitle: t => titles.push(t) }).setWindowTitle("matomezu の開き方")
  expect(titles).toEqual(["matomezu の開き方"])
  expect(() => createMatomezu({ plugins: BUILTIN }).setWindowTitle("x")).not.toThrow()
})

test("windowTitle は渡した口の今のタイトルを返し、口が無ければ空", () => {
  expect(createMatomezu({ plugins: BUILTIN, windowTitle: () => "matomezu" }).windowTitle()).toBe("matomezu")
  expect(createMatomezu({ plugins: BUILTIN }).windowTitle()).toBe("")
})
