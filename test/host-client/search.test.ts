// メモリのホストクライアントの言葉の検索: つながっているインスタンスのレコードを、searchTexts を書いた種類だけ、部分一致で探す
import { expect, test } from "bun:test"
import { BUILTIN_UI } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { memoryClient } from "./memory"

const TICKET = "@matomezu/taskboard:ticket"
const HISTORY = "@matomezu/taskboard:ticket-history"
const by = { kind: "user" }
const at = "2026-01-01T00:00:00.000Z"
const ticket = (id: string, number: number, name: string, body = "") => ({
  id,
  project: "p1",
  number,
  name,
  body,
  lane: "todo",
  tags: [],
  priority: "medium",
  assignees: [],
  createdAt: at,
  createdBy: by,
  updatedAt: at,
})

function setup() {
  const client = memoryClient()
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: BUILTIN_UI,
    search: q => client.search(q),
  })
  client.connect(store)
  store.receive(
    {
      books: [],
      settings: {},
      records: {
        [TICKET]: {
          t1: ticket("t1", 1, "ログイン画面", "パスワードの確認"),
          t2: ticket("t2", 2, "一覧"),
        },
        [HISTORY]: { h1: { id: "h1", ticket: "t2", topic: "topic-status", text: "確認が済んだ", at, by } },
      },
    },
    [],
  )
  return { client, store }
}

test("題（番号と名前）・本文に当たったチケットと、履歴の当たり（親のチケットを of に持つ）を返す", async () => {
  const { client } = setup()
  const answer = await client.search({ terms: ["確認"] })
  expect(answer.total).toBe(2)
  const hits = Object.fromEntries(answer.hits.map(h => [h.id, h]))
  expect(hits.t1?.part).toBe("body")
  expect(hits.h1?.of).toEqual({ kind: TICKET, id: "t2" })
  expect((await client.search({ terms: ["ログ"] })).hits.map(h => h.id)).toEqual(["t1"])
  expect((await client.search({ terms: ["2 "] })).hits.map(h => h.id)).toEqual(["t2"])
})

test("種類で絞れる。当たらなければ空、件数と続きの位置で切れる", async () => {
  const { client } = setup()
  expect((await client.search({ terms: ["確認"], kinds: [HISTORY] })).hits.map(h => h.id)).toEqual(["h1"])
  expect(await client.search({ terms: ["ない"] })).toEqual({ total: 0, hits: [] })
  const first = await client.search({ terms: ["確認"], limit: 1 })
  expect(first).toMatchObject({ total: 2, more: 1, next: 1 })
  expect((await client.search({ terms: ["確認"], limit: 1, offset: first.next })).hits).toHaveLength(1)
})
