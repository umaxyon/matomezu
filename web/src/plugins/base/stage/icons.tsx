// ステージのコマンドのアイコン
import { icon } from "../icon"
import { STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "."

const SPLIT = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M12 5v14" />
  </>,
)

export const STAGE_ICONS = {
  [STAGE_HOME.id]: icon(
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>,
  ),
  [STAGE_SPLIT.id]: SPLIT,
  [STAGE_UNSPLIT.id]: SPLIT,
}
