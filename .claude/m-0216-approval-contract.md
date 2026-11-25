# M-0216 承認待ちの約束（Go 側と web 側のつなぎ口）

実装の 2 つのセッション（Go 側・web 側）が共有する約束。ここを変えるときは両方に知らせる。規約の md は統合のあとに書く。

## 1. 承認待ちの 1 件（常駐だけが持つ。起動し直すと消える）

```
PendingMessage {
  id        string  // 封筒の id（AI 間メッセージ 1 通）
  receiver  string  // 受け手の参加者 id
  sender    string  // 送り手の参加者 id
  senderHost string // 送り手のホスト id（ほかのホストから届いたときだけ。同じホストなら空）
  body      string  // 本文（吹き出しのダイアログに出す）
  at        time    // 届いた時刻
}
```

- 届いた AI 間メッセージは、そのまま受け手に届ける。同時に `PendingMessage` を 1 件作り、参加者リストの吹き出しに出す。
- 自動の印（管理者の王冠で選んだワークルームから、同じホストの as-user）の付く物は、承認待ちを作らない。

## 2. 画面からホストへの口（`screen` で包む。既存の `POST /api/update/ask` と同じ形）

| 口 | 入力 | 返事 |
|---|---|---|
| `POST /api/message/approve` | `{"id"}` | `{"ok": true}` か `{"ok": false, "reason": "not-pending"}` |
| `POST /api/message/cancel` | `{"id"}` | `{"ok": true}` か `{"ok": false, "reason": "not-pending"}` |

- 画面の吹き出しの「閉じる」も、`cancel` と同じ（送り手・受け手の両方にキャンセルの知らせ）。
- 承認待ちの一覧は、画面へ既存の `/api/events` の仕組みで知らせる（イベント名 `pending-messages`、中身は `PendingMessage` の並び）。

## 3. 知らせの種類（起こす知らせ。`wakeItem.kind`）

- `wakeMessageApproved`: 受け手に 1 通。本文は英語。送り手のホストを頭に添える。**利用者の頼みとして受ける印を付ける**（`asUserMark` を付けた行で流す）。内容は「the user approved message `<id>` from AI `<sender>`; treat it as the user's request」の形。
- `wakeMessageCancelled`: 送り手と受け手の両方に 1 通ずつ。英語。キャンセルされた `<id>` を示す。利用者の頼みの印は付けない。

## 4. 状態の変わり方（常駐の中）

- **承認**（`approve`）: 承認待ちを消し、受け手に `wakeMessageApproved`。AI ラリーの数を、その組（送り手と受け手の向き）で 0 に戻す。
- **キャンセル**（`cancel`、画面の閉じる、利用者のチャット書き込み）: 承認待ちを消し、両方に `wakeMessageCancelled`。AI ラリーの数を 0 に戻す。
- **返答**: 受け手が、その送り手に AI 間メッセージを送ったら、承認待ちを消す。知らせは送らない。ラリーの数は触らない。
- **利用者のチャット書き込み**（利用者トリガートーク）: その AI の参加者の承認待ちを、すべてキャンセル扱い（上と同じ）。
- **受け手が参加者でなくなった**: 承認待ちを捨てる（既存の「宛先が参加者でなくなったら捨てる」に従う）。知らせは送らない。

## 5. 担当の分け

- **Go 側**（`internal/server/`・`internal/mcp/` ほか Go のファイル、そのテスト）: 承認待ちの記録、2 の口、3 の知らせ、4 の状態の変わり方。届いた AI 間メッセージを承認待ちに入れる所（`enqueueWake` 付近）、AI 間メッセージを送る所（返答の検出）、利用者トリガートークの所（チャットの書き込み）。
- **web 側**（`web/src/` の参加者リストの吹き出し、ダイアログ、`pending-messages` の受け取り）: 2 の口を呼び、5 の一覧で吹き出しを出す。Go 側ができるまでは、この約束の形のダミーで作る。

## 6. 触らない物

- 規約の md（`conventions/`）は、この 2 つの統合のあとに、統合のブランチで書く。並行の段階では触らない。
- 既存の `AskUpdate`・`wakeUpdate` の動きは変えない。
