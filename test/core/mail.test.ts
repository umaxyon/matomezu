// 郵便箱のアクションの結果の確かめ（core/mail.ts の mailboxSettles）: 新しく入った・変わった郵便は、形に合い、種類が機能台帳にあって props がその形に合うものだけ。
// 前からあった郵便は、効かなくなっていても（種類を外したなど）そのまま通す
import { expect, test } from "bun:test"
import { type Mail, mailboxSettles } from "../../web/src/core/mail"
import { CORE_CATALOG } from "../support"

const letter = (id: string, props: unknown, mail = "@matomezu/base:mail-letter"): Mail => ({
  id,
  mail,
  from: "a",
  sentAt: "2026-11-06T00:00:00.000Z",
  props,
})

test("新しい郵便は、種類が機能台帳にあり、props がその形に合えば通る。種類が無い・props が合わない・形が合わない物は断る", () => {
  const good = letter("m1", { title: "題", body: "" })
  expect(mailboxSettles(CORE_CATALOG, [], [good])).toBe(true)
  expect(mailboxSettles(CORE_CATALOG, [], [letter("m2", { title: "題", body: "" }, "@ex/x:nothing")])).toBe(false)
  expect(mailboxSettles(CORE_CATALOG, [], [letter("m3", { title: "", body: "" })])).toBe(false)
  expect(mailboxSettles(CORE_CATALOG, [], [{ ...good, id: "" }])).toBe(false)
})

test("前からあった郵便は、効かなくなっていても確かめ直さない", () => {
  const old = letter("m1", { title: "題", body: "" }, "@ex/x:gone")
  expect(mailboxSettles(CORE_CATALOG, [old], [old, letter("m2", { title: "次", body: "" })])).toBe(true)
})
