// ディレクトリ構成図のアイコン: 鉛筆の道具。24 の四角の中に描く線
import { PENCIL_TOOL } from "./tools"

export const DIR_TOOL_ICONS = {
  [PENCIL_TOOL.id]: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  ),
}
