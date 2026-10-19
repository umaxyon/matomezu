// 画面などに出す文言の表。鍵は日本語の文そのもので、ほかの言語の訳を持つ。{name} は t() に渡す値で置き換える
export const MESSAGES = {
  画面を分割: { en: "Split screen" },
  ブックを開く: { en: "Open book" },
  ページを足す: { en: "Add page" },
  "ページ {n}": { en: "Page {n}" },
  ステージ: { en: "Stage" },
  紙: { en: "Paper" },
  ブックを選択してください: { en: "Select a book" },
  ブックを探す: { en: "Search books" },
  ブックの名前で探す: { en: "Search by book name" },
  ブック: { en: "Books" },
  当てはまるブックはありません: { en: "No matching books" },
} as const satisfies Record<string, Record<Exclude<Lang, "ja">, string>>

export type Lang = "ja" | "en"
export type MessageKey = keyof typeof MESSAGES
