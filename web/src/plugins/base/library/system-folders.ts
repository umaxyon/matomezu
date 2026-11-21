// システムフォルダ: base のドキュメント。足りない行を足し、名前の当たる物に番号を付けるのは、core の読む関数（core/unreadable.ts の settleLibrary）

import { kit } from "../kit"

export const DOCUMENTS = kit.defineSystemFolder({
  id: "documents",
  title: "Documents",
  aiDescription: "The documents folder: a folder that is always at the top of the library home.",
})
