// ディレクトリ構成図の中身のデータ: ページのフィールド root（根のフォルダ）に、中身（フォルダとファイル）を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// どの中身も id・種類（kind）・名前・説明（description。行の右に並べて見せる 1 行）・アイコン（icon。種類ごとに選べる絵の名前。無ければ種類の既定の絵）を持ち、
// フォルダは閉じているか（closed）と中身を持てる。
// 名前と説明は、base の本文の装飾（**太字**・{色:文字}）で書ける。同じフォルダに同じ名前があってもよい（id で見分ける）。
// id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewEntrySchema）
import { z } from "zod"

export const KINDS = ["folder", "file"] as const
export type Kind = (typeof KINDS)[number]

// 中身のアイコン（絵の名前）: フォルダは folder（既定）か book、ファイルは file（既定）かそれ以外。絵は node-icons.tsx
export const FOLDER_ICONS = ["folder", "book"] as const
export const FILE_ICONS = [
  "file",
  "drawing",
  "flowchart",
  "tree",
  "directory",
  "markdown",
  "slide",
  "class-diagram",
  "html",
] as const
export type FolderIconName = (typeof FOLDER_ICONS)[number]
export type FileIconName = (typeof FILE_ICONS)[number]
export const ICONS = [...FOLDER_ICONS, ...FILE_ICONS] as const
export type IconName = (typeof ICONS)[number]

const folderIcon = () =>
  z
    .enum(FOLDER_ICONS)
    .describe("The icon drawn at the head of the row: folder (the default) or book (a book is a folder of pages)")
const fileIcon = () =>
  z
    .enum(FILE_ICONS)
    .describe("The icon drawn at the head of the row: file (the default) or the icon of a kind of diagram or document")

export interface DirFile {
  id: string
  kind: "file"
  name: string
  description?: string
  icon?: FileIconName
}

export interface DirFolder {
  id: string
  kind: "folder"
  name: string
  description?: string
  icon?: FolderIconName
  closed?: boolean
  children?: DirEntry[]
}

export type DirEntry = DirFile | DirFolder

// 名前の形（装飾の書き方を AI に見せる）
const nameText = () =>
  z
    .string()
    .describe(
      "Name. **bold** makes it bold and {name:text} colors it with a text color (name from textColors); unpaired marks stay as they are, and a \\ before *, {, } or \\ keeps that character as it is",
    )

// 説明の形（行の右に並べて見せる 1 行。装飾の書き方を AI に見せる）
export const descriptionText = () =>
  z
    .string()
    .describe(
      "Description, one line drawn to the right of the rows (all descriptions start at the same x; cut with … when the paper is too narrow, hidden when the rows reach 80% of the paper's width). **bold** and {name:text} decorate it",
    )

const FileSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: nameText(),
  description: descriptionText().optional(),
  icon: fileIcon().optional(),
})

export const DirFolderSchema: z.ZodType<DirFolder> = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("folder"),
  name: nameText(),
  description: descriptionText().optional(),
  icon: folderIcon().optional(),
  closed: z.boolean().optional(),
  get children() {
    return z.array(z.union([FileSchema, DirFolderSchema])).optional()
  },
})

// ページ page の根のフォルダ（無いか形が合わなければ undefined）
export const dirRootOf = (page: object | null | undefined): DirFolder | undefined =>
  DirFolderSchema.safeParse(page && "root" in page ? page.root : undefined).data

// 足すときに受ける中身（id は書かない。閉じているかと中身はフォルダだけ）
export type NewEntry =
  | { kind: "file"; name: string; description?: string; icon?: FileIconName }
  | {
      kind: "folder"
      name: string
      description?: string
      icon?: FolderIconName
      closed?: boolean
      children?: NewEntry[]
    }

const NewFileSchema = z.strictObject({
  kind: z.literal("file"),
  name: nameText(),
  description: descriptionText().optional(),
  icon: fileIcon().optional(),
})

export const NewEntrySchema: z.ZodType<NewEntry> = z.union([
  NewFileSchema,
  z.strictObject({
    kind: z.literal("folder"),
    name: nameText(),
    description: descriptionText().optional(),
    icon: folderIcon().optional(),
    closed: z.boolean().optional().describe("Drawn closed (its contents hidden)"),
    get children() {
      return z.array(NewEntrySchema).optional()
    },
  }),
])

// 振った id（受けた中身と同じ入れ子）
export interface GivenId {
  id: string
  children?: GivenId[]
}

// 受けた中身に、上から順に id を振る
export function giveIds(entries: readonly NewEntry[], makeId: () => string): { entries: DirEntry[]; ids: GivenId[] } {
  const out = entries.map((e): { entry: DirEntry; given: GivenId } => {
    const id = makeId()
    const description = e.description ? { description: e.description } : {}
    if (e.kind === "file")
      return {
        entry: { id, kind: "file", name: e.name, ...description, ...(e.icon ? { icon: e.icon } : {}) },
        given: { id },
      }
    const kids = giveIds(e.children ?? [], makeId)
    return {
      entry: {
        id,
        kind: "folder",
        name: e.name,
        ...description,
        ...(e.icon ? { icon: e.icon } : {}),
        ...(e.closed ? { closed: true } : {}),
        ...(kids.entries.length > 0 ? { children: kids.entries } : {}),
      },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { entries: out.map(o => o.entry), ids: out.map(o => o.given) }
}
