// ディレクトリ構成図の中身のデータ: ページのフィールド root（根のフォルダ）に、中身（フォルダとファイル）を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// どの中身も id・種類（kind）・名前・説明（description。行の右に並べて見せる 1 行）・色（color。代表色の名前か #rrggbb。無ければテーマの色）を持ち、
// フォルダは閉じているか（closed）と中身を持てる。
// 名前と説明は、base の本文の装飾（**太字**・{色:文字}）で書ける。同じフォルダに同じ名前があってもよい（id で見分ける）。
// id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewEntrySchema）
import { z } from "zod"
import { HEX, PALETTE } from "../../../plugin-api"

export const KINDS = ["folder", "file"] as const
export type Kind = (typeof KINDS)[number]

// 中身の色（代表色の名前か #rrggbb）
export const EntryColorSchema = z.union([z.enum(PALETTE), z.string().regex(HEX)])

export interface DirFile {
  id: string
  kind: "file"
  name: string
  description?: string
  color?: string
}

export interface DirFolder {
  id: string
  kind: "folder"
  name: string
  description?: string
  color?: string
  closed?: boolean
  children?: DirEntry[]
}

export type DirEntry = DirFile | DirFolder

// 名前の形（装飾の書き方を AI に見せる）
const nameText = () =>
  z
    .string()
    .describe(
      "Name. **bold** makes it bold and {name:text} colors it with a text color (name from textColors); unpaired marks stay as they are",
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
  color: EntryColorSchema.optional(),
})

export const DirFolderSchema: z.ZodType<DirFolder> = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("folder"),
  name: nameText(),
  description: descriptionText().optional(),
  color: EntryColorSchema.optional(),
  closed: z.boolean().optional(),
  get children() {
    return z.array(z.union([FileSchema, DirFolderSchema])).optional()
  },
})

// 足すときに受ける中身（id は書かない。閉じているかと中身はフォルダだけ）
export type NewEntry =
  | { kind: "file"; name: string; description?: string; color?: string }
  | { kind: "folder"; name: string; description?: string; color?: string; closed?: boolean; children?: NewEntry[] }

const NewFileSchema = z.strictObject({
  kind: z.literal("file"),
  name: nameText(),
  description: descriptionText().optional(),
  color: EntryColorSchema.optional(),
})

export const NewEntrySchema: z.ZodType<NewEntry> = z.union([
  NewFileSchema,
  z.strictObject({
    kind: z.literal("folder"),
    name: nameText(),
    description: descriptionText().optional(),
    color: EntryColorSchema.optional(),
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
    const color = {
      ...(e.description ? { description: e.description } : {}),
      ...(e.color ? { color: e.color } : {}),
    }
    if (e.kind === "file") return { entry: { id, kind: "file", name: e.name, ...color }, given: { id } }
    const kids = giveIds(e.children ?? [], makeId)
    return {
      entry: {
        id,
        kind: "folder",
        name: e.name,
        ...color,
        ...(e.closed ? { closed: true } : {}),
        ...(kids.entries.length > 0 ? { children: kids.entries } : {}),
      },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { entries: out.map(o => o.entry), ids: out.map(o => o.given) }
}
