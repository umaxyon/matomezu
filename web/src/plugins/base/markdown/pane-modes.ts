// マークダウンのペインの並べ方（編集とプレビューの 2 つのペインの見せ方）の 4 つの値: 左右（split-row）・上下（split-column）に 2 つ並べるか、
// ソースだけ（source-only）・描いた文書だけ（rendered-only）。値の並びと型だけを出す（並べ方を持つマークダウンのブックのビューが使う）
export const MARKDOWN_PANE_MODES = ["split-row", "split-column", "source-only", "rendered-only"] as const
export type MarkdownPaneMode = (typeof MARKDOWN_PANE_MODES)[number]
