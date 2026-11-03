// 選択に足す・外すクリックの修飾キー Mod（Mac は Cmd、ほかは Ctrl。キーの書き方の Mod と同じ）を押しているか
import { isMac } from "../../../ui/keys"

export const modPressed = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMac() ? e.metaKey : e.ctrlKey)
