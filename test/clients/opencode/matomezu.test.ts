import { describe, expect, test } from "bun:test"
import {
  type Matomezu,
  type Processes,
  type PromptEvent,
  type SessionApi,
  sendModel,
  startWatch,
  talked,
  type WatchChild,
  wokenTurn,
} from "../../../clients/opencode/matomezu"

// 偽の子プロセス: run は呼ばれた引数と標準入力を残し、talked には answer を返す。spawn は立てた watch を残す
const fakeProcesses = (answer = "") => {
  const runs: { args: string[]; input?: string }[] = []
  const spawned: (WatchChild & { killed: number; args: string[] })[] = []
  const p: Processes = {
    run: async (_m, args, input) => {
      runs.push({ args, input })
      if (args[0] === "annotations") return "NOTE"
      return args[0] === "talked" ? answer : ""
    },
    spawn: (_m, args) => {
      const child = {
        exitCode: null as number | null,
        signalCode: null as string | null,
        killed: 0,
        args,
        kill() {
          child.killed++
        },
      }
      spawned.push(child)
      return child
    },
  }
  return { p, runs, spawned }
}

// 偽の会話の口: 親（parentID）を答え、文脈の項目・題名の変更を残す
const fakeSession = (parentID?: string) => {
  const calls: string[] = []
  const session = {
    hook: async () => {},
    get: async () => (parentID ? { parentID } : {}),
    update: async (input: { title: string }) => calls.push(`update ${input.title}`),
    instructions: {
      entry: {
        put: async (input: { key: string; value: string }) => calls.push(`put ${input.key} ${input.value}`),
        remove: async (input: { key: string }) => calls.push(`remove ${input.key}`),
      },
    },
  } as unknown as SessionApi
  return { session, calls }
}

let seq = 0
// 会話の id は、テストごとに違う物（親を持つかは会話ごとに覚えるため）
const sessionID = () => `ses_test_${++seq}`
const m: Matomezu = { bin: "/x/matomezu" }

describe("watch", () => {
  test("実行ファイルと保管庫の組ごとに 1 本だけ立て、最後の後始末で止める", () => {
    const { p, spawned } = fakeProcesses()
    const a: Matomezu = { bin: "/w1/matomezu" }
    const b: Matomezu = { bin: "/w1/matomezu", home: "/w1/.dev-home" }
    const stopA1 = startWatch(a, p)
    const stopA2 = startWatch(a, p)
    const stopB = startWatch(b, p)
    expect(spawned.length).toBe(2)
    expect(spawned[0]?.args).toEqual([
      "watch",
      "--host",
      String(process.pid),
      "--",
      "/w1/matomezu",
      "deliver",
      "opencode",
    ])
    stopA1()
    stopA1()
    expect(spawned[0]?.killed).toBe(0)
    stopA2()
    expect(spawned[0]?.killed).toBe(1)
    stopB()
    expect(spawned[1]?.killed).toBe(1)
  })

  test("止まった watch は、次の setup で立て直す", () => {
    const { p, spawned } = fakeProcesses()
    const a: Matomezu = { bin: "/w2/matomezu" }
    const stop1 = startWatch(a, p)
    spawned[0]!.exitCode = 1
    const stop2 = startWatch(a, p)
    expect(spawned.length).toBe(2)
    stop1()
    expect(spawned[1]?.killed).toBe(0)
    stop2()
    expect(spawned[1]?.killed).toBe(1)
  })
})

describe("ターンの始まり", () => {
  const say = async () => {}
  const event = (metadata?: Record<string, unknown>): PromptEvent => ({
    sessionID: sessionID(),
    prompt: { text: "hi" },
    metadata,
  })

  test("起こす知らせの印のある発言には --woken を付け、ない発言には付けない。--host は付けない", async () => {
    const { session } = fakeSession()
    const woken = fakeProcesses()
    const e = event({ matomezu: "wake" })
    await talked(session, m, say, e, woken.p)
    expect(woken.runs.map(r => r.args[0])).toEqual(["annotations", "talked"])
    expect(woken.runs[1]?.args).toEqual(["talked", "--context", "NOTE", "--format", "split", "--woken"])
    expect(JSON.parse(woken.runs[1]?.input ?? "")).toEqual({ session_id: e.sessionID, prompt: "hi" })
    for (const metadata of [undefined, { matomezu: "other" }, { other: "wake" }]) {
      const talk = fakeProcesses()
      await talked(session, m, say, event(metadata), talk.p)
      expect(talk.runs[1]?.args).toEqual(["talked", "--context", "NOTE", "--format", "split"])
    }
  })

  test("AI に足す文があれば文脈の項目に入れ、無ければ項目を消す", async () => {
    const put = fakeSession()
    await talked(put.session, m, say, event(), fakeProcesses(`{"forAi":"NOTE"}\n`).p)
    expect(put.calls).toEqual(["put matomezu NOTE"])
    const remove = fakeSession()
    await talked(remove.session, m, say, event(), fakeProcesses("").p)
    expect(remove.calls).toEqual(["remove matomezu"])
  })

  test("題名は会話の題名に、利用者に見せる文は会話の id を添えて渡す", async () => {
    const { session, calls } = fakeSession()
    const said: string[] = []
    const e = event()
    const answer = `{"message":"参加しました","forAi":"You joined","sessionTitle":"ひよこ"}\n`
    await talked(session, m, async (id, message) => said.push(`${id} ${message}`), e, fakeProcesses(answer).p)
    expect(calls).toEqual(["put matomezu You joined", "update ひよこ"])
    expect(said).toEqual([`${e.sessionID} 参加しました`])
  })

  test("親を持つ会話（サブエージェント）では、matomezu を呼ばず、文脈の項目にも触らない", async () => {
    const { session, calls } = fakeSession("ses_parent")
    const { p, runs } = fakeProcesses(`{"forAi":"NOTE"}`)
    await talked(session, m, say, event(), p)
    await sendModel(session, m, { sessionID: sessionID(), model: { providerID: "opencode", id: "x" } }, p)
    expect(runs).toEqual([])
    expect(calls).toEqual([])
  })
})

describe("起こす知らせで始まったターン", () => {
  const say = async () => {}
  const wake = (id: string, metadata: Record<string, unknown> = { matomezu: "wake" }) => ({
    id,
    role: "user",
    content: [{ type: "text", text: "matomezu: the user accepted" }],
    metadata,
  })

  test("最後の入力が起こす知らせなら、1 度だけ --woken を付けて知らせ、AI に足す文をこの呼び出しの system にも足す", async () => {
    const { session, calls } = fakeSession()
    const { p, runs } = fakeProcesses(`{"forAi":"You joined"}`)
    const id = sessionID()
    const system: unknown[] = []
    const e = { sessionID: id, messages: [wake(`msg_${id}`)], system }
    await wokenTurn(session, m, say, e, p)
    await wokenTurn(session, m, say, e, p)
    expect(runs.map(r => r.args)).toEqual([
      ["annotations"],
      ["talked", "--context", "NOTE", "--format", "split", "--woken"],
    ])
    expect(JSON.parse(runs[1]?.input ?? "")).toEqual({ session_id: id, prompt: "matomezu: the user accepted" })
    expect(calls).toEqual(["put matomezu You joined"])
    expect(system).toEqual([{ type: "text", text: "You joined" }])
  })

  test("印の無い入力・利用者の発言でない最後の物では、何もしない", async () => {
    const { session, calls } = fakeSession()
    const { p, runs } = fakeProcesses(`{"forAi":"x"}`)
    const id = sessionID()
    await wokenTurn(session, m, say, { sessionID: id, messages: [wake(`msg_a_${id}`, {})], system: [] }, p)
    await wokenTurn(session, m, say, { sessionID: id, messages: [{ ...wake(`msg_b_${id}`), role: "assistant" }] }, p)
    await wokenTurn(session, m, say, { sessionID: id }, p)
    expect(runs).toEqual([])
    expect(calls).toEqual([])
  })
})

describe("モデル", () => {
  test("会話のモデルが変わったときだけ、プロバイダとモデルの名前を --host なしで知らせる", async () => {
    const { session } = fakeSession()
    const { p, runs } = fakeProcesses()
    const id = sessionID()
    const model = { providerID: "opencode", id: "deepseek" }
    await sendModel(session, m, { sessionID: id, model }, p)
    await sendModel(session, m, { sessionID: id, model }, p)
    await sendModel(session, m, { sessionID: id, model: { providerID: "opencode", id: "other" } }, p)
    expect(runs.map(r => [r.args, JSON.parse(r.input ?? "")])).toEqual([
      [["model"], { session_id: id, model: "opencode/deepseek" }],
      [["model"], { session_id: id, model: "opencode/other" }],
    ])
  })
})
