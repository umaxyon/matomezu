// ブックを開くの文言
import { defineMessages } from "../../../core/i18n/messages"

export const BOOK_OPEN_MESSAGES = defineMessages({
  "Open book": { en: "Open book", ja: "ブックを開く" },
  "Cannot open: it does not fit the shape of a book": {
    en: "Cannot open: it does not fit the shape of a book",
    ja: "開けません: ブックの形に合いません",
  },
  "Cannot open: it breaks the rules of its lineup or of a page type": {
    en: "Cannot open: it breaks the rules of its lineup or of a page type",
    ja: "開けません: 並びかページのタイプの決まりを守っていません",
  },
  "Untitled ({id})": { en: "Untitled ({id})", ja: "名前なし（{id}）" },
  "Move to trash": { en: "Move to trash", ja: "ゴミ箱に入れる" },
  Trash: { en: "Trash", ja: "ゴミ箱" },
  "Trash {count}": { en: "Trash {count}", ja: "ゴミ箱 {count}" },
  Restore: { en: "Restore", ja: "戻す" },
  "Could not restore": { en: "Could not restore", ja: "戻せません" },
  "Could not delete": { en: "Could not delete", ja: "消せません" },
  "Empty trash": { en: "Empty trash", ja: "ゴミ箱を空にする" },
  "The trash is empty": { en: "The trash is empty", ja: "ゴミ箱は空です" },
  "The book will be deleted for good": { en: "The book will be deleted for good", ja: "ブックが完全に消えます" },
  "Every book in the trash will be deleted for good": {
    en: "Every book in the trash will be deleted for good",
    ja: "ゴミ箱のブックが全部、完全に消えます",
  },
  "Some parts cannot be shown": { en: "Some parts cannot be shown", ja: "一部表示できない物があります" },
  "Search books": { en: "Search books", ja: "ブックを探す" },
  "Search by book name": { en: "Search by book name", ja: "ブックの名前で探す" },
  Books: { en: "Books", ja: "ブック" },
  "No matching books": { en: "No matching books", ja: "当てはまるブックはありません" },
})
