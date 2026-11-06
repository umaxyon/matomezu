import { expect, test } from "bun:test"
import { detectLang, type Params, translate } from "../../web/src/core/i18n/i18n"
import { defineMessages, joinMessages } from "../../web/src/core/i18n/messages"
import { CORE_CATALOG } from "../support"

test("英語は鍵のまま、ほかの言語は表の訳を出し、{name} を値で置き換える", () => {
  expect(translate(CORE_CATALOG.messages, "en", "@matomezu/base:Page {n}", { n: 3 })).toBe("Page 3")
  expect(translate(CORE_CATALOG.messages, "ja", "@matomezu/base:Page {n}", { n: 3 })).toBe("ページ 3")
  expect(translate(CORE_CATALOG.messages, "ja", "@matomezu/base:Split screen")).toBe("画面を分割")
})

test("値が { message } なら、その鍵の文言を同じ言語で出して埋める", () => {
  const params: Params = { book: "設計メモ", reason: { message: "@matomezu/base:Locked" } }
  expect(translate(CORE_CATALOG.messages, "ja", '@matomezu/base:{reason}: "{book}"', params)).toBe(
    "「設計メモ」がロック中",
  )
  expect(translate(CORE_CATALOG.messages, "en", '@matomezu/base:{reason}: "{book}"', params)).toBe('Locked: "設計メモ"')
})

test("訳の中の {name} は、英語の鍵と同じものを使う", () => {
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
  for (const [key, langs] of CORE_CATALOG.messages)
    for (const [lang, text] of Object.entries(langs))
      expect({ key, lang, names: names(text) }).toEqual({ key, lang, names: names(key) })
})

test("訳の無い言語と表に無い鍵は、英語の鍵をそのまま出す", () => {
  expect(translate(CORE_CATALOG.messages, "fr", "@matomezu/base:Page {n}", { n: 2 })).toBe("Page 2")
  expect(translate(new Map(), "ja", "@matomezu/base:Page {n}", { n: 2 })).toBe("@matomezu/base:Page 2")
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

test("フォルダごとの表を joinMessages で 1 つにする。同じ訳の重なりは通し、同じ鍵に違う訳を書くと型の誤り", () => {
  const a = defineMessages({
    Create: { en: "Create", ja: "作成" },
    "Read by AI": { en: "Read by AI", ja: "AI が読みました" },
  })
  const b = defineMessages({ Create: { en: "Create", ja: "作成" }, Read: { en: "Read", ja: "既読" } })
  const joined = joinMessages(a, b)
  joined.Read.ja satisfies "既読"
  expect(Object.keys(joined)).toEqual(["Create", "Read by AI", "Read"])
  const c = defineMessages({ "Read by AI": { en: "Read", ja: "既読" } })
  // @ts-expect-error 同じ鍵 "Read by AI" に違う訳
  joinMessages(a, c)
})

test("base の伝言と送信トレイは、AI が読んだことをそれぞれの訳で出す", () => {
  expect(translate(CORE_CATALOG.messages, "ja", "@matomezu/base:Read by AI")).toBe("AI が読みました")
  expect(translate(CORE_CATALOG.messages, "ja", "@matomezu/base:Read")).toBe("既読")
})
