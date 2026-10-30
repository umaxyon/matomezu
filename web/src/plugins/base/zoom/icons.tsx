// 拡大縮小のコマンドのアイコン（初めの位置は家、ページ全体を収めるは四隅の外向きの印、縮小は −、拡大は ＋）
import { icon } from "../icon"
import { ZOOM_FIT, ZOOM_IN, ZOOM_OUT, ZOOM_RESET } from "."

export const ZOOM_ICONS = {
  [ZOOM_RESET.id]: icon(<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" />),
  [ZOOM_OUT.id]: icon(<path d="M5 12h14" />),
  [ZOOM_IN.id]: icon(<path d="M12 5v14M5 12h14" />),
  [ZOOM_FIT.id]: icon(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />), // 四隅の外向きの印
}
