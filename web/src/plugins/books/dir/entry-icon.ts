// ディレクトリの中身（フォルダとファイル）のアイコン: 列挙 entry-icon。ディレクトリが宣言し、ブックのタイプのプラグインや追加プラグインが値（自分の絵の名前）を足す。
// 値の data は、使える種類 kinds（フォルダ用・ファイル用・両方）。絵は値を足したプラグインが見た目の側で結ぶ（ui の enumValueIcons）。
// 中身の icon は値の id。ある・種類に合うかは、データの形でなく、アクションが確かめる（値を足したプラグインを外してもブックが読めるように）。
// 値が無い・絵が無い中身は、種類の既定の絵で描く（データは消さない）
import { z } from "zod"
import { type CoreCatalog, enumValuesOf } from "../../../plugin-api"
import { KINDS, type Kind } from "./entry"
import { kit } from "./kit"

export const ENTRY_ICON = kit.defineEnum({
  id: "entry-icon",
  title: "entry icon",
  aiDescription:
    "The icons a folder or a file of a directory page can wear at the head of its row. entry-add, entry-update and page-add take the id of one of them as icon (the values are listed in the arguments).",
  value: z.strictObject({ kinds: z.array(z.enum(KINDS)).min(1) }), // 使える種類
})

export type EntryIconData = z.output<typeof ENTRY_ICON.value>

export const ICON_FOLDER = kit.defineEnumValue({
  id: "entry-icon-folder",
  enum: ENTRY_ICON.id,
  title: "Folder",
  aiDescription: "A folder (the default for a folder).",
  data: { kinds: ["folder"] },
})
export const ICON_BOOK = kit.defineEnumValue({
  id: "entry-icon-book",
  enum: ENTRY_ICON.id,
  title: "Book",
  aiDescription: "A book, a folder of pages.",
  data: { kinds: ["folder"] },
})
export const ICON_FILE = kit.defineEnumValue({
  id: "entry-icon-file",
  enum: ENTRY_ICON.id,
  title: "File",
  aiDescription: "A plain file (the default for a file).",
  data: { kinds: ["file"] },
})
export const ICON_DIRECTORY = kit.defineEnumValue({
  id: "entry-icon-directory",
  enum: ENTRY_ICON.id,
  title: "Directory icon",
  aiDescription: "A directory diagram.",
  data: { kinds: ["file"] },
})
export const ICON_CLASS_DIAGRAM = kit.defineEnumValue({
  id: "entry-icon-class-diagram",
  enum: ENTRY_ICON.id,
  title: "Class diagram",
  aiDescription: "A class diagram.",
  data: { kinds: ["file"] },
})
export const ICON_HTML = kit.defineEnumValue({
  id: "entry-icon-html",
  enum: ENTRY_ICON.id,
  title: "HTML",
  aiDescription: "An HTML document.",
  data: { kinds: ["file"] },
})

// 種類の既定のアイコン（中身に icon が無いか、値や絵が無いときに描く）
export const DEFAULT_ICON: Readonly<Record<Kind, string>> = { folder: ICON_FOLDER.id, file: ICON_FILE.id }

// 種類 kind の中身が選べるアイコンの値（足された順。機能台帳から）
export const iconsFor = (catalog: CoreCatalog, kind: Kind) =>
  enumValuesOf(catalog, ENTRY_ICON.id).filter(v => (v.data as EntryIconData).kinds.includes(kind))

// icon が種類 kind の中身のアイコンとして選べないわけ（選べれば null）
export function iconProblem(catalog: CoreCatalog, kind: Kind, icon: string): string | null {
  const value = enumValuesOf(catalog, ENTRY_ICON.id).find(v => v.id === icon)
  if (!value) return `${icon} is not a value of entry-icon`
  return (value.data as EntryIconData).kinds.includes(kind) ? null : `${icon} is not an icon for a ${kind}`
}

// AI に見せる、選べるアイコンの一覧（値の id・使える種類・説明）
export const iconsDescription = (catalog: CoreCatalog): string =>
  enumValuesOf(catalog, ENTRY_ICON.id)
    .map(v => `${v.id} (${(v.data as EntryIconData).kinds.join(", ")}): ${v.aiDescription}`)
    .join("\n")
