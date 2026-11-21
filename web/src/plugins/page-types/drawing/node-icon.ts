// ディレクトリ構成図の中身のアイコンとして、このタイプの絵の名前を足す（列挙 @matomezu/dir:node-icon の値。絵は ui.tsx で結ぶ）
import { kit } from "./kit"

export const DRAWING_NODE_ICON = kit.defineEnumValue({
  id: "node-icon",
  enum: "@matomezu/dir:node-icon",
  title: "Drawing",
  aiDescription: "A drawing.",
  data: { kinds: ["file"] },
})
