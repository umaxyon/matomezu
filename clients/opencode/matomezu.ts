// opencode のプラグイン（index.ts）の、matomezu を呼ぶ所と会話に当てる所（opencode が貸すモジュールを読まないので、テストから読める）
import { execFile, spawn } from "node:child_process"
import { accessSync, constants, existsSync } from "node:fs"
import { delimiter, dirname, join } from "node:path"

// 起こす知らせの印（clients/opencode/deliver の WakeMetadata と同じ。Go のテストが見張る）
const WAKE_KEY = "matomezu"
const WAKE_VALUE = "wake"

// AI に足す文を入れる、会話の文脈の項目の名前
const ENTRY_KEY = "matomezu"

// matomezu のコマンドの答えを待つ上限（ターンの始まりを止め続けない）
const COMMAND_TIMEOUT = 10_000

// 使う matomezu: 実行ファイルと、開発の常駐のとき（matomezu のリポジトリ）はそのリポジトリの根と保管庫フォルダ
export type Matomezu = { bin: string; root?: string; home?: string }

export const ignore = () => {}

// opencode のサーバーのプロセスに 1 つの、matomezu ごとの watch
type Watch = { child?: WatchChild; users: number }
const watches = shared<Watch>("watches")

// shared は、opencode のサーバーのプロセスに 1 つの表 name（フォルダごとの setup は、モジュールを読み直すので globalThis に持つ）
function shared<T>(name: string) {
  const key = Symbol.for(`matomezu.opencode.${name}`)
  return (): Map<string, T> => {
    const g = globalThis as { [key: symbol]: Map<string, T> | undefined }
    g[key] ??= new Map()
    return g[key]
  }
}

// 会話ごとの、親を持つか（親は変わらないので、一度聞いたら覚える）と、最後に知らせたモデル
const children = shared<boolean>("children")
const models = shared<string>("models")

const executable = (path: string) => {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// 立てた watch のうち、使う所
export type WatchChild = { exitCode: number | null; signalCode: string | null; kill(): unknown }

// matomezu を動かす口: run は引数 args・標準入力 input で動かして標準出力を返し（失敗・時間切れは空）、spawn は立てたままにする
export type Processes = {
  run(m: Matomezu, args: string[], input?: string): Promise<string>
  spawn(m: Matomezu, args: string[]): WatchChild
}

export const processes: Processes = {
  run: (m, args, input = "") =>
    new Promise<string>(resolve => {
      const child = execFile(m.bin, args, { env: envOf(m), timeout: COMMAND_TIMEOUT }, (err, stdout) =>
        resolve(err ? "" : String(stdout)),
      )
      child.stdin?.on("error", ignore)
      child.stdin?.end(input)
    }),
  spawn: (m, args) => {
    const child = spawn(m.bin, args, { env: envOf(m), stdio: "ignore" })
    child.on("error", ignore)
    return child
  },
}

const envOf = (m: Matomezu) => (m.home ? { ...process.env, MATOMEZU_HOME: m.home } : process.env)

// findMatomezu は、フォルダ directory で呼ぶ matomezu。directory が matomezu のリポジトリ（git の共通のフォルダの隣に開発の常駐 .dev-home がある）なら、
// その常駐（MATOMEZU_HOME も合わせる）。そうでなければ PATH の matomezu。どちらも無ければ undefined
export const findMatomezu = (directory: string) =>
  new Promise<Matomezu | undefined>(resolve => {
    execFile(
      "git",
      ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { timeout: COMMAND_TIMEOUT },
      (err, stdout) => {
        const common = err ? "" : String(stdout).trim()
        if (common !== "") {
          const home = join(dirname(common), ".dev-home")
          if (executable(join(home, "matomezu")))
            return resolve({ bin: join(home, "matomezu"), root: dirname(common), home })
        }
        const names = process.platform === "win32" ? ["matomezu.exe"] : ["matomezu"]
        for (const dir of (process.env.PATH ?? "").split(delimiter)) {
          for (const name of names) {
            if (dir !== "" && executable(join(dir, name))) return resolve({ bin: join(dir, name) })
          }
        }
        resolve(undefined)
      },
    )
  })

// startWatch は、matomezu m の watch を（無いか止まっていれば）起こし、使う数を 1 つ増やす。返す関数で 1 つ減らし、0 になったら止める
export const startWatch = (m: Matomezu, p: Processes = processes) => {
  const key = `${m.bin}\n${m.home ?? ""}`
  const all = watches()
  const w = all.get(key) ?? { users: 0 }
  all.set(key, w)
  if (w.child === undefined || w.child.exitCode !== null || w.child.signalCode !== null) {
    w.child = p.spawn(m, ["watch", "--host", String(process.pid), "--", m.bin, "opencode", "deliver"])
  }
  w.users++
  let released = false
  return () => {
    if (released) return
    released = true
    w.users--
    if (w.users > 0) return
    all.delete(key)
    w.child?.kill()
  }
}

// talkedAnswer は、matomezu talked --format split の答え
type TalkedAnswer = { message?: string; forAi?: string; sessionTitle?: string }

const readAnswer = (out: string): TalkedAnswer => {
  try {
    return out.trim() === "" ? {} : (JSON.parse(out) as TalkedAnswer)
  } catch {
    return {}
  }
}

// opencode のプラグインの setup が受け取る物のうち、使う所
export type PromptEvent = { sessionID: string; prompt?: { text?: string }; metadata?: Record<string, unknown> }
export type ContextMessage = {
  id?: string
  role?: string
  content?: { type?: string; text?: string }[]
  metadata?: Record<string, unknown>
}
export type ContextEvent = {
  sessionID: string
  model?: { id?: string; providerID?: string }
  messages?: ContextMessage[]
  system?: unknown[]
}
export type SessionApi = {
  hook(name: "prompt", fn: (e: PromptEvent) => Promise<void>): Promise<unknown>
  hook(name: "context", fn: (e: ContextEvent) => Promise<void>): Promise<unknown>
  get(input: { sessionID: string }): Promise<{ parentID?: string } | undefined>
  update(input: { sessionID: string; title: string }): Promise<unknown>
  instructions: {
    entry: {
      put(input: { sessionID: string; key: string; value: string }): Promise<unknown>
      remove(input: { sessionID: string; key: string }): Promise<unknown>
    }
  }
}
export type McpServer = { type: "local"; command: string[]; environment?: Record<string, string> }

// say は、会話 sessionID を開いている TUI に、利用者に見せる文 message を渡す
export type Say = (sessionID: string, message: string) => Promise<unknown>

// mcpServer は、matomezu m の MCP の起動のしかた。開発の常駐なら、開発の画面を配る web/dist（あれば）と開発の保管庫を渡す（ポートは保管庫が決める）。
// 起こす知らせを渡すコマンド（-- opencode deliver）は付けない: 同じプロセスの watch が渡し、MCP はフォルダごとに立つので、付けると watch が増える
export const mcpServer = (m: Matomezu): McpServer => {
  if (m.root === undefined) return { type: "local", command: [m.bin, "opencode", "mcp"] }
  const web = join(m.root, "web", "dist")
  const command = [m.bin, "opencode", "mcp", ...(existsSync(web) ? ["--web", web] : [])]
  return { type: "local", command, environment: m.home ? { MATOMEZU_HOME: m.home } : {} }
}

// quietly は、fn を行い、投げた物を捨てる（opencode のターンを止めない）
export const quietly = (fn: () => unknown) => Promise.resolve().then(fn).then(ignore, ignore)

// isChild は、会話 sessionID が親を持つ（サブエージェントの会話）か。聞けなければ持たないとする
export const isChild = async (session: SessionApi, sessionID: string) => {
  const known = children().get(sessionID)
  if (known !== undefined) return known
  const info = await session.get({ sessionID }).catch(() => undefined)
  const child = info?.parentID !== undefined && info.parentID !== ""
  if (info !== undefined) children().set(sessionID, child)
  return child
}

// Turn は、matomezu に知らせるターンの始まり: 会話・始めた入力・起こす知らせで始まったか
type Turn = { sessionID: string; prompt: string; woken: boolean }

// answerTurn は、ターンの始まり turn を matomezu m に知らせ、答えを会話に当てて（文脈の項目・題名・利用者に見せる文）、答えを返す
const answerTurn = async (session: SessionApi, m: Matomezu, say: Say, turn: Turn, p: Processes) => {
  const notes = await p.run(m, ["annotations", "--session", turn.sessionID])
  // --host は渡さない: 常駐は同じプロセスの新しいセッション id を同じ会話として結び直すが、opencode は 1 つのプロセスに会話がいくつもある
  const args = ["talked", "--context", notes, "--format", "split"]
  if (turn.woken) args.push("--woken")
  const answer = readAnswer(await p.run(m, args, JSON.stringify({ session_id: turn.sessionID, prompt: turn.prompt })))
  const entry = { sessionID: turn.sessionID, key: ENTRY_KEY }
  // 文脈の項目は会話に残るので、足す文が無いターンには消し、前のターンの文を見せ続けない
  await quietly(() =>
    answer.forAi
      ? session.instructions.entry.put({ ...entry, value: answer.forAi })
      : session.instructions.entry.remove(entry),
  )
  const title = answer.sessionTitle
  if (title) await quietly(() => session.update({ sessionID: turn.sessionID, title }))
  const message = answer.message
  if (message) await quietly(() => say(turn.sessionID, message))
  return answer
}

const marked = (metadata: Record<string, unknown> | undefined) => metadata?.[WAKE_KEY] === WAKE_VALUE

// talked は、利用者の発言で始まったターン e（prompt のフック）を matomezu m に知らせ、答えを会話に当てる
export const talked = async (session: SessionApi, m: Matomezu, say: Say, e: PromptEvent, p: Processes = processes) => {
  if (await isChild(session, e.sessionID)) return
  await answerTurn(
    session,
    m,
    say,
    { sessionID: e.sessionID, prompt: e.prompt?.text ?? "", woken: marked(e.metadata) },
    p,
  )
}

// 知らせ済みの、起こす知らせの入力の id（ターンの中でモデルを呼ぶたびに context のフックが走るので、1 度だけ知らせる）
const wakes = shared<true>("wakes")

// wokenTurn は、起こす知らせ（matomezu opencode deliver が synthetic の入力で渡す。prompt のフックは走らない）で始まったターンを、
// そのターンの最初のモデルの呼び出し（context のフック e）で matomezu m に知らせ、答えを会話に当てる。
// 文脈の項目は次の段から効くので、AI に足す文はこの呼び出しの system にも足す
export const wokenTurn = async (
  session: SessionApi,
  m: Matomezu,
  say: Say,
  e: ContextEvent,
  p: Processes = processes,
) => {
  const last = e.messages?.at(-1)
  if (last?.id === undefined || last.role !== "user" || !marked(last.metadata) || wakes().has(last.id)) return
  wakes().set(last.id, true)
  if (await isChild(session, e.sessionID)) return
  const prompt = (last.content ?? []).map(c => c.text ?? "").join("")
  const answer = await answerTurn(session, m, say, { sessionID: e.sessionID, prompt, woken: true }, p)
  if (answer.forAi) e.system?.push({ type: "text", text: answer.forAi })
}

// sendModel は、会話 e のモデルが前に知らせた物と違えば、matomezu m に知らせる（--host は talked と同じ理由で渡さない）
export const sendModel = async (session: SessionApi, m: Matomezu, e: ContextEvent, p: Processes = processes) => {
  const model = e.model?.id ? [e.model.providerID, e.model.id].filter(Boolean).join("/") : ""
  if (model === "" || models().get(e.sessionID) === model || (await isChild(session, e.sessionID))) return
  models().set(e.sessionID, model)
  await p.run(m, ["model"], JSON.stringify({ session_id: e.sessionID, model }))
}
