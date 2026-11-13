// 郵便の確かめ（core/mail.ts の checkMail。残した郵便は core/records.ts の checkRecords から）と、届いた順の並べ方。AI が読む取り方は read_records（常駐のテスト）（mailForAi）。
// 郵便は役 mails の種類のレコードで、届いた順は order
import { expect, test } from "bun:test"
import { checkMail, type Mail, mailsInOrder } from "../../web/src/core/mail"
import { checkRecords } from "../../web/src/core/records"
import { CORE_CATALOG } from "../support"

const MAIL = "@matomezu/base:mail"
let order = 0
const letter = (id: string, props: unknown, mail = "@matomezu/base:letter"): Mail => ({
  id,
  mail,
  from: "a",
  sentAt: "2026-11-06T00:00:00.000Z",
  props,
  order: ++order,
})

test("郵便は、種類が機能台帳にあり、形と props がその形に合えば効く。種類が無いのは W022、形・props が合わないのは W023", () => {
  expect(checkMail(CORE_CATALOG, letter("m1", { title: "題", body: "" }))).toEqual([])
  expect(checkMail(CORE_CATALOG, letter("m2", {}, "@ex/x:gone")).map(w => w.code)).toEqual(["W022"])
  expect(checkMail(CORE_CATALOG, letter("m3", { title: "" })).map(w => w.code)).toEqual(["W023"])
  const { order: _, ...noOrder } = letter("m4", { title: "題", body: "" })
  expect(checkMail(CORE_CATALOG, noOrder).map(w => w.code)).toEqual(["W023"])
})

test("残した郵便のレコードの効かない物は、郵便の warning にする（W022・W023。W025 にはしない）。データには手を付けない", () => {
  const table = Object.fromEntries(
    [letter("m1", { title: "題", body: "" }), letter("m2", {}, "@ex/x:gone"), letter("m3", { title: "" })].map(m => [
      m.id,
      m,
    ]),
  )
  expect(checkRecords(CORE_CATALOG, { [MAIL]: table }).map(w => [w.code, w.params.id])).toEqual([
    ["W022", "m2"],
    ["W023", "m3"],
  ])
})

test("郵便のレコードは order の順に並ぶ。order が数でない郵便はいちばん古い所に置く（同じ順は id の順）", () => {
  const a = { ...letter("a", {}), order: 3 }
  const b = { ...letter("b", {}), order: 1 }
  const c = { ...letter("c", {}), order: "x" }
  const d = { ...letter("d", {}), order: undefined }
  expect(mailsInOrder([a, c, b, d]).map(m => m.id)).toEqual(["c", "d", "b", "a"])
})
