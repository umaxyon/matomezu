// ディレクトリ構成図の中身のデータ: ページのフィールド root（根のフォルダ）に、中身（フォルダとファイル）を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// どの中身も id・種類（kind）・名前・説明（description。行の右に並べて見せる 1 行）・アイコン（icon。種類ごとに選べる絵の名前。無ければ種類の既定の絵）を持ち、
// フォルダは閉じているか（closed）と中身を持てる。
// 名前と説明は、base の本文の装飾（**太字**・{色:文字}）で書ける。同じフォルダに同じ名前があってもよい（id で見分ける）。
// id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewNodeSchema）
import { z } from "zod"
import { NO_PAGE } from "../../../plugin-api"

export const KINDS = ["folder", "file"] as const
export type Kind = (typeof KINDS)[number]

// 中身のアイコン: 列挙 node-icon の値の id（node-icon-enum.ts）。無ければ種類の既定の絵。ある・種類に合うかは、データの形でなく、アクションが確かめる
const ICON_DOC =
  "The id of a value of the enum node-icon for this kind, drawn at the head of the row (the default icon of its kind without it)"
const iconText = (doc: string = ICON_DOC) => z.string().min(1).describe(doc)

export interface DirFile {
  id: string
  kind: "file"
  name: string
  description?: string
  icon?: string
}

export interface DirFolder {
  id: string
  kind: "folder"
  name: string
  description?: string
  icon?: string
  closed?: boolean
  children?: DirNode[]
}

export type DirNode = DirFile | DirFolder

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
  icon: iconText().optional(),
})

export const DirFolderSchema: z.ZodType<DirFolder> = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("folder"),
  name: nameText(),
  description: descriptionText().optional(),
  icon: iconText().optional(),
  closed: z.boolean().optional(),
  get children() {
    return z.array(z.union([FileSchema, DirFolderSchema])).optional()
  },
})

// ページ page の根のフォルダ（ページが無い〈NO_PAGE〉か、根が無いか形が合わなければ undefined）
export const dirRootOf = (page: object | typeof NO_PAGE | null | undefined): DirFolder | undefined =>
  DirFolderSchema.safeParse(page !== NO_PAGE && page && "root" in page ? page.root : undefined).data

// 足すときに受ける中身（id は書かない。閉じているかと中身はフォルダだけ）
export type NewNode =
  | { kind: "file"; name: string; description?: string; icon?: string }
  | {
      kind: "folder"
      name: string
      description?: string
      icon?: string
      closed?: boolean
      children?: NewNode[]
    }

// 足すときに受ける中身の形。AI に見せるときは、icon の説明に選べるアイコンの一覧を入れる（describeArgs）
export const newNodeOf = (iconDoc?: string): z.ZodType<NewNode> => {
  const schema: z.ZodType<NewNode> = z.union([
    z.strictObject({
      kind: z.literal("file"),
      name: nameText(),
      description: descriptionText().optional(),
      icon: iconText(iconDoc).optional(),
    }),
    z.strictObject({
      kind: z.literal("folder"),
      name: nameText(),
      description: descriptionText().optional(),
      icon: iconText(iconDoc).optional(),
      closed: z.boolean().optional().describe("Drawn closed (its contents hidden)"),
      get children() {
        return z.array(schema).optional()
      },
    }),
  ])
  return schema
}

export const NewNodeSchema = newNodeOf()

// 受けた中身の入れ子のどれかが、アイコンを選べない（種類に合わない・値が無い）ときのわけ（無ければ null）。アイコンの検査（node-icon-enum.ts の iconProblem）を渡して使う
export function newNodesProblem(
  nodes: readonly NewNode[],
  problem: (kind: Kind, icon: string) => string | null,
): string | null {
  for (const e of nodes) {
    const here = e.icon === undefined ? null : problem(e.kind, e.icon)
    if (here) return here
    const below = e.kind === "folder" ? newNodesProblem(e.children ?? [], problem) : null
    if (below) return below
  }
  return null
}

// 振った id（受けた中身と同じ入れ子）
export interface GivenId {
  id: string
  children?: GivenId[]
}

// 受けた中身に、上から順に id を振る
export function giveIds(nodes: readonly NewNode[], makeId: () => string): { nodes: DirNode[]; ids: GivenId[] } {
  const out = nodes.map((e): { node: DirNode; given: GivenId } => {
    const id = makeId()
    const description = e.description ? { description: e.description } : {}
    if (e.kind === "file")
      return {
        node: { id, kind: "file", name: e.name, ...description, ...(e.icon ? { icon: e.icon } : {}) },
        given: { id },
      }
    const kids = giveIds(e.children ?? [], makeId)
    return {
      node: {
        id,
        kind: "folder",
        name: e.name,
        ...description,
        ...(e.icon ? { icon: e.icon } : {}),
        ...(e.closed ? { closed: true } : {}),
        ...(kids.nodes.length > 0 ? { children: kids.nodes } : {}),
      },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { nodes: out.map(o => o.node), ids: out.map(o => o.given) }
}
