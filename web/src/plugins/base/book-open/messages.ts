// ブックを開くの文言
import { defineMessages } from "../../../core/i18n/messages"

export const BOOK_OPEN_MESSAGES = defineMessages({
  "Open book": { en: "Open book", ja: "ブックを開く" },
  "Cannot open: there is no book type {type}": {
    en: "Cannot open: there is no book type {type}",
    ja: "開けません: ブックのタイプ {type} がありません",
  },
  "Cannot open: it does not fit the book type {type}": {
    en: "Cannot open: it does not fit the book type {type}",
    ja: "開けません: ブックのタイプ {type} の形に合いません",
  },
  "Cannot open: it breaks the rules of the book type {type}": {
    en: "Cannot open: it breaks the rules of the book type {type}",
    ja: "開けません: ブックのタイプ {type} の決まりを守っていません",
  },
  "Untitled ({id})": { en: "Untitled ({id})", ja: "名前なし（{id}）" },
  "Move to trash": { en: "Move to trash", ja: "ゴミ箱に入れる" },
  Trash: { en: "Trash", ja: "ゴミ箱" },
  "Trash {count}": { en: "Trash {count}", ja: "ゴミ箱 {count}" },
  Restore: { en: "Restore", ja: "戻す" },
  "Empty trash": { en: "Empty trash", ja: "ゴミ箱を空にする" },
  "The trash is empty": { en: "The trash is empty", ja: "ゴミ箱は空です" },
  "The book will be deleted for good": { en: "The book will be deleted for good", ja: "ブックが完全に消えます" },
  "Every book in the trash will be deleted for good": {
    en: "Every book in the trash will be deleted for good",
    ja: "ゴミ箱のブックが全部、完全に消えます",
  },
  "Some parts cannot be shown": { en: "Some parts cannot be shown", ja: "一部表示できない物があります" },
})
