// ディレクトリ構成図の中身のアイコンとして、このタイプの絵の名前を足す（列挙 @matomezu/dir:entry-icon の値。絵は ui.tsx で結ぶ）
import { kit } from "./kit"

export const DRAWING_ENTRY_ICON = kit.defineEnumValue({
  id: "entry-icon",
  enum: "@matomezu/dir:entry-icon",
  title: "Drawing",
  aiDescription: "A drawing.",
  data: { kinds: ["file"] },
})
