// しおりの帯の色の名前（Bookmarks.module.css の data-tone。スキンの accent・success・warn の色）
export const BOOKMARK_TONES = ["accent", "success", "warn"] as const
export type BookmarkTone = (typeof BOOKMARK_TONES)[number]
