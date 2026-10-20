import { expect, test } from "bun:test"
import { detectLang, LANGS, translate } from "../../web/src/core/i18n/i18n"
import { REGISTRY } from "../support"

test("日本語は鍵のまま、ほかの言語は表の訳を出し、{name} を値で置き換える", () => {
  expect(translate(REGISTRY.messages, "ja", "ページ {n}", { n: 3 })).toBe("ページ 3")
  expect(translate(REGISTRY.messages, "en", "ページ {n}", { n: 3 })).toBe("Page 3")
  expect(translate(REGISTRY.messages, "en", "画面を分割")).toBe("Split screen")
})

test("訳の中の {name} は、日本語の鍵と同じものを使う", () => {
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
  for (const [key, langs] of REGISTRY.messages) {
    for (const lang of LANGS.filter(l => l !== "ja")) {
      expect({ key, lang, names: names(langs[lang as "en"]) }).toEqual({ key, lang, names: names(key) })
    }
  }
})

test("表に無い鍵は、日本語の鍵をそのまま出す", () => {
  expect(translate(new Map(), "en", "ページ {n}", { n: 2 })).toBe("ページ 2")
})

test("言語の並びの先頭が日本語なら日本語、そうでなければ英語", () => {
  expect(detectLang(["ja-JP", "en"])).toBe("ja")
  expect(detectLang(["ja"])).toBe("ja")
  expect(detectLang(["en-US", "ja"])).toBe("en")
  expect(detectLang(["fr"])).toBe("en")
  expect(detectLang([])).toBe("en")
})
