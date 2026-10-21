// ステージのコマンドのアイコン
import { icon } from "../icon"

const SPLIT = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M12 5v14" />
  </>,
)

export const STAGE_ICONS = {
  "stage.home": icon(
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>,
  ),
  "stage.split": SPLIT,
  "stage.unsplit": SPLIT,
}
