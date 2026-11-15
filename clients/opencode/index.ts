// opencode のプラグイン（V2）: opencode のサーバー（opencode serve --service）のプロセスの中で動き、会話を開いたフォルダごとに setup が 1 回ずつ走る。
// - 起こす知らせ: opencode のサーバーのプロセスに、使う matomezu ごとに 1 本だけ matomezu watch を起こし、知らせを matomezu opencode deliver で会話に渡させる
//   （どのフォルダの setup からでも同じ 1 本を使い、最後の後始末で止める。--host はこのプロセスの id で、MCP の親と同じ）
// - ターンの始まり（prompt のフック）: matomezu annotations の文を添えて matomezu talked を呼び、
//   AI に足す文を、その会話の文脈の項目（instructions の entry）に入れ、題名があれば会話の題名にする
// - 起こす知らせで始まったターン（synthetic の入力。prompt のフックは走らない）: 最初のモデルの呼び出しの context のフックで、talked に --woken を付けて同じことをする
// - モデル（context のフック）: 会話のモデルが変わったら matomezu model で知らせる
// - 利用者に見せる文（talked の message）: プラグインの RPC の知らせで、その会話を開いている TUI に渡す（TUI のプラグイン tui.ts がトーストで出す）
// - MCP: matomezu の MCP を、フォルダごとに "matomezu" の名で足す（開くフォルダが matomezu のリポジトリなら、開発の常駐を選ぶ）
// 親を持つ会話（サブエージェントの会話）では、ターンの始まりとモデルを行わない（Claude Code はサブエージェントのターンでフックを呼ばない）
// どの matomezu を呼ぶかは findMatomezu が決める。見つからなければ何もしない
import { Rpc } from "@opencode/plugin/rpc"
import { Schema } from "effect"
import {
  findMatomezu,
  ignore,
  type McpServer,
  mcpServer,
  quietly,
  type Say,
  type SessionApi,
  sendModel,
  startWatch,
  talked,
  wokenTurn,
} from "./matomezu"
import { MESSAGE_EVENT, type MessageData, RPC_ID } from "./names"

// 利用者に見せる文を TUI に届ける RPC（メソッドは無く、知らせだけ）
const notices = Rpc.define({
  id: RPC_ID,
  methods: {},
  events: { [MESSAGE_EVENT]: { schema: Schema.Struct({ sessionID: Schema.String, message: Schema.String }) } },
})

type Context = {
  location?: { directory?: string }
  session: SessionApi
  mcp: { transform(fn: (draft: { set(name: string, server: McpServer): void }) => void): Promise<unknown> }
  rpc: {
    register(
      definition: typeof notices,
      handlers: Record<string, never>,
    ): Promise<{ dispose(): Promise<unknown>; events: { emit(name: string, data: MessageData): Promise<unknown> } }>
  }
}

export default {
  id: "matomezu",
  async setup(ctx: Context) {
    const m = await findMatomezu(ctx.location?.directory ?? process.cwd())
    if (m === undefined) return ignore
    await quietly(() => ctx.mcp.transform(draft => draft.set("matomezu", mcpServer(m))))
    const rpc = await ctx.rpc.register(notices, {}).catch(() => undefined)
    const say: Say = async (sessionID, message) => rpc?.events.emit(MESSAGE_EVENT, { sessionID, message })
    const stopWatch = startWatch(m)
    await ctx.session.hook("prompt", e => quietly(() => talked(ctx.session, m, say, e)))
    await ctx.session.hook("context", async e => {
      // モデルを呼ぶたびに走るので、モデルの知らせは待たせない
      void quietly(() => sendModel(ctx.session, m, e))
      await quietly(() => wokenTurn(ctx.session, m, say, e))
    })
    return () => {
      stopWatch()
      void quietly(() => rpc?.dispose())
    }
  },
}
