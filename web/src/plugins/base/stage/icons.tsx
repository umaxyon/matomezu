// ステージのコマンドのアイコン
import { icon } from "../utils/icon"
import { STAGE_SPLIT, STAGE_UNSPLIT } from "."

const SPLIT = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M12 5v14" />
  </>,
)

export const STAGE_ICONS = {
  [STAGE_SPLIT.id]: SPLIT,
  [STAGE_UNSPLIT.id]: SPLIT,
}
