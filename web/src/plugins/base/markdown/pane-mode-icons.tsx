// マークダウンのペインの並べ方ごとのアイコン: ソースだけは鉛筆、左右・上下は分けた枠、プレビューだけは目
import type { ReactNode } from "react"
import type { MarkdownPaneMode } from "./pane-modes"

const icon = (children: ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const MARKDOWN_PANE_MODE_ICONS: Readonly<Record<MarkdownPaneMode, ReactNode>> = {
  "source-only": icon(
    <>
      <path d="M10.5 2.5l3 3-7.5 7.5H3v-3z" />
      <path d="M9 4l3 3" />
    </>,
  ),
  "split-row": icon(
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M8 3v10" />
    </>,
  ),
  "split-column": icon(
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M2 8h12" />
    </>,
  ),
  "rendered-only": icon(
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>,
  ),
}
