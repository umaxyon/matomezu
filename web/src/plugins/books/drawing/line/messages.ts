// 線の文言
import { defineMessages } from "../../../../core/i18n/messages"

export const LINE_MESSAGES = defineMessages({
  Line: { ja: "線" },
  "Connect items": { ja: "線を引く" },
  "Update line": { ja: "線を変える" },
  "Reconnect line": { ja: "線をつなぎ替える" },
  "Edit line": { ja: "線の編集" },
  Route: { ja: "通り方" },
  Elbow: { ja: "折れ線" },
  Straight: { ja: "直線" },
  "Line style": { ja: "線の種類" },
  Solid: { ja: "実線" },
  Dashed: { ja: "破線" },
  Start: { ja: "始点" },
  End: { ja: "終点" },
  "Start head": { ja: "始点の形" },
  "End head": { ja: "終点の形" },
  "▶ Filled triangle": { ja: "▶ 塗りの三角" },
  "> Open arrowhead": { ja: "> 開いた矢じり" },
  "▷ Hollow triangle": { ja: "▷ 白抜きの三角" },
  "◆ Filled diamond": { ja: "◆ 塗りのひし形" },
  "◇ Hollow diamond": { ja: "◇ 白抜きのひし形" },
  "ER: one": { ja: "ER: 1" },
  "ER: many": { ja: "ER: 多" },
  "ER: zero or one": { ja: "ER: 0 か 1" },
  "ER: zero or more": { ja: "ER: 0 以上" },
  "ER: one or more": { ja: "ER: 1 以上" },
  Ends: { ja: "端の位置" },
  "Align ends": { ja: "整列" },
  "Keeps the shape and fixes both ends at the middle of their sides, or straight across where the facing sides overlap":
    {
      ja: "今の形のまま、両端を辺の真ん中（向き合う辺どうしでまっすぐ結べるなら、まっすぐ結ぶ位置）に固定します",
    },
  "Free ends": { ja: "接辺の自動選択" },
  "Stops fixing the ends: the sides and places are chosen from the items' positions": {
    ja: "端の固定をやめ、つなぐ辺と位置をボックスの位置から自動で選びます",
  },
  "Auto bends": { ja: "折れ線を自動に戻す" },
  "Drops the moved middle segments and draws the bends automatically": {
    ja: "動かした途中の区間をやめ、自動で決めた形に戻します",
  },
  "Auto caption place": { ja: "キャプションの位置を自動に戻す" },
  "Puts the caption back at its automatic place on the line": {
    ja: "動かしたキャプションを、線の上の自動の位置に戻します",
  },
  "Delete line": { ja: "線を消す" },
})
