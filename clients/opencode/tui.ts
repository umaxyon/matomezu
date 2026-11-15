// opencode の TUI のプラグイン（V2）: TUI のプロセスの中で動く。サーバーのプラグイン（index.ts）が RPC の知らせで渡す、利用者に見せる文を、
// その会話を開いている TUI にだけトーストで出す（ほかの会話を開いている TUI には出さない）
import { MESSAGE_EVENT, type MessageData, RPC_ID } from "./names"

// TUI のプラグインの setup が受け取る物のうち、使う所
type Api = {
  client: { event: { subscribe(input: { signal: AbortSignal }): AsyncIterable<{ type: string; data?: unknown }> } }
  ui: {
    router: { current(): { type: string; sessionID?: string } }
    toast: { show(input: { message: string }): void }
  }
}

const TYPE = `rpc.${RPC_ID}.${MESSAGE_EVENT}`

export default {
  id: "matomezu",
  async setup(api: Api) {
    const stop = new AbortController()
    void (async () => {
      for await (const event of api.client.event.subscribe({ signal: stop.signal })) {
        if (event.type !== TYPE) continue
        const data = event.data as MessageData
        const here = api.ui.router.current()
        if (here.type === "session" && here.sessionID === data.sessionID) api.ui.toast.show({ message: data.message })
      }
    })().catch(() => {})
    return () => stop.abort()
  },
}
