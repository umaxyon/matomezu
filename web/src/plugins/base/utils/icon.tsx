// メニューに出すコマンドのアイコンの形（24 の四角の中に描く線）
import type { ReactNode } from "react"

export const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {paths}
  </svg>
)
