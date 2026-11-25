// 開発専用のダミー: 承認待ちの AI 間メッセージを、常駐の pending-messages の代わりに流す（Go 側ができるまでの仮）。
// 読むのは main.tsx だけで、URL に ?dev-pending-fixture=<受け手の参加者 id> が付いているときだけ（通常の経路は読まない）。
import type { MatomezuInstance, PendingMessage } from "../store/state"

// 受け手の参加者 id（receiver）に、ダミーの承認待ちを 2 通渡す。送り手は同じホストと、ほかのホストの 2 通
export function applyDevPendingFixture(instance: MatomezuInstance, receiver: string): void {
  const fixture: readonly PendingMessage[] = [
    {
      id: "dev-message-1",
      receiver,
      sender: "dev-sender-same-host",
      senderHost: "",
      body: "開発用のダミーの本文です。承認か、キャンセルを押してください。",
      at: "2026-11-25T00:00:00Z",
    },
    {
      id: "dev-message-2",
      receiver,
      sender: "dev-sender-other-host",
      senderHost: "dev-other-host",
      body: "ほかのホストから届いたダミーの本文です。\n二行目も出ます。",
      at: "2026-11-25T00:01:00Z",
    },
  ]
  instance.setPendingMessages(fixture)
}
