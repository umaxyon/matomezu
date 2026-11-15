// サーバーのプラグイン（index.ts）と TUI のプラグイン（tui.ts）が共に使う名前

// 利用者に見せる文を TUI に届ける、opencode のプラグインの RPC の id と、その知らせの名前（知らせの種類は rpc.<id>.<名前>）
export const RPC_ID = "matomezu"
export const MESSAGE_EVENT = "message"

// 利用者に見せる文の知らせの中身: どの会話の文か
export type MessageData = { sessionID: string; message: string }
