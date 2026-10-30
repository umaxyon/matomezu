// base の文字の色: 本文の一部に付ける、意味の役割の色（成功・情報・注意・誤り）。テーマ（textColors）とブックの設定（book-text-colors）で変えられる
import { kit } from "../kit"

export const TEXT_SUCCESS = kit.defineTextColor({
  id: "success",
  title: "Success",
  color: "#16a34a",
  aiDescription: "done, good",
})
export const TEXT_INFO = kit.defineTextColor({
  id: "info",
  title: "Info",
  color: "#2563eb",
  aiDescription: "information, a note",
})
export const TEXT_WARN = kit.defineTextColor({
  id: "warn",
  title: "Warning",
  color: "#d97706",
  aiDescription: "caution",
})
export const TEXT_ERROR = kit.defineTextColor({
  id: "error",
  title: "Error",
  color: "#dc2626",
  aiDescription: "a problem, an error",
})

export const TEXT_COLORS = [TEXT_SUCCESS, TEXT_INFO, TEXT_WARN, TEXT_ERROR] as const
