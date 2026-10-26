import { expect, test } from "bun:test"
import { detectLang, translate } from "../../web/src/core/i18n/i18n"
import { CORE_CATALOG } from "../support"

test("英語は鍵のまま、ほかの言語は表の訳を出し、{name} を値で置き換える", () => {
  expect(translate(CORE_CATALOG.messages, "en", "Page {n}", { n: 3 })).toBe("Page 3")
  expect(translate(CORE_CATALOG.messages, "ja", "Page {n}", { n: 3 })).toBe("ページ 3")
  expect(translate(CORE_CATALOG.messages, "ja", "@matomezu/base:Split screen")).toBe("画面を分割")
})

test("訳の中の {name} は、英語の鍵と同じものを使う", () => {
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
  for (const [key, langs] of CORE_CATALOG.messages)
    for (const [lang, text] of Object.entries(langs))
      expect({ key, lang, names: names(text) }).toEqual({ key, lang, names: names(key) })
})

test("訳の無い言語と表に無い鍵は、英語の鍵をそのまま出す", () => {
  expect(translate(CORE_CATALOG.messages, "fr", "Page {n}", { n: 2 })).toBe("Page 2")
  expect(translate(new Map(), "ja", "Page {n}", { n: 2 })).toBe("Page 2")
})

test("好む言語の並びから、インスタンスにある最初の言語を選ぶ。無ければ英語", () => {
  const langs = ["en", "ja"]
  expect(detectLang(["ja-JP", "en"], langs)).toBe("ja")
  expect(detectLang(["ja"], langs)).toBe("ja")
  expect(detectLang(["en-US", "ja"], langs)).toBe("en")
  expect(detectLang(["fr", "ja"], langs)).toBe("ja")
  expect(detectLang(["fr"], langs)).toBe("en")
  expect(detectLang([], langs)).toBe("en")
})
