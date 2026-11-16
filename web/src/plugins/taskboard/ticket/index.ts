// チケット: タスクボードの 1 枚。1 枚が 1 件のレコードで、プロジェクトの id（project）を持つ。
// 番号（number）はプロジェクトごとの連番で、使い回さない（番号の表の区切りがプロジェクトの id）。
// レーン（lane。レーンの id か未分類）・タグ（tags。タグの id の並び。空ならタグなし）は id を書いたまま残し、読む側が「無い物は未分類・付いていない」とする。
// タグは付けた順のまま持ち、見せるときはプロジェクトのタグの順に並べる（tagsOf）
import { z } from "zod"
import { BY } from "../by"
import { kit } from "../kit"
import { inDoneLane, PROJECT, UNSORTED } from "../project"
import { ticketLabel } from "./label"

export const TICKET_NAME_MAX = 50
export const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const
export const PRIORITY_DEFAULT = "medium"

export const TICKET = kit.defineSubject({
  id: "ticket",
  title: "ticket",
  aiDescription:
    "A ticket: one card of a project's task board. It has the project's id, a number (counted for each project and never reused), a name, a body (markdown), the lane (a lane's id of the project, or unsorted), the tags (tags' ids of the project, none or more, no tag twice), the priority (lowest, low, medium, high or highest) and the times it was filed and last changed. The assignees are workrooms' ids, in order. A lane that is not there any more reads as unsorted; a tag or assignee that is not there any more is left out. It also has who filed it and when. A locked ticket cannot be changed or removed. A completed ticket (one in the done lane of its project) is left out of the list by default: the list says how many it left out.",
  record: z.strictObject({
    id: z.string().min(1),
    project: z.string().min(1),
    number: z.number().int().min(1),
    name: z.string().trim().min(1).max(TICKET_NAME_MAX),
    body: z.string(),
    lane: z.string().min(1),
    priority: z.enum(PRIORITIES),
    assignees: z.array(z.string().min(1)), // 担当のワークルームの id（順序つき。消したワークルームの id は書いたまま残し、読む側が外す）
    createdAt: z.string(),
    createdBy: BY, // 起票した者（起票は履歴の行にせず、ここと createdAt から見せる）
    updatedAt: z.string(),
    locked: z.literal(true).optional(), // ロックの印（base の lockable）
    tags: z.array(z.string().min(1)).refine(ids => new Set(ids).size === ids.length), // 付けたタグの id（付けた順。重ならない。消したタグの id は書いたまま残し、読む側が外す）
  }),
  refers: t => [{ subject: PROJECT.id, id: t.project }],
  // プロジェクトのチケットを、レーンと担当の有無で探す（完了のレーンの確かめなど。担当の人数 assigned は、いない 0）
  keys: {
    project: { type: "text", of: t => t.project },
    lane: { type: "text", of: t => t.lane },
    assigned: { type: "number", of: t => t.assignees.length },
    number: { type: "number", of: t => t.number }, // 番号（プロジェクトごとの連番。プロジェクトと合わせて 1 枚を引く）
  },
  numbered: true,
  lockable: true,
  // 番号と名前が題（チケットプレフィクスは別のレコードなので入れない）、本文が本文
  searchTexts: t => ({ title: `${t.number} ${t.name}`, body: t.body }),
  aiOrder: t => t.number,
  // 完了のチケット（プロジェクトの完了のレーンにあるチケット）は、既定の目次に載せない（完了はたまる一方なので）。read_records の unlisted で取れる
  aiListed: {
    when: (t, ctx) => {
      const project = ctx.record(PROJECT.id, t.project) as { doneLane?: string } | "none"
      return project === "none" || !inDoneLane(project, t.lane)
    },
    unlisted:
      "completed tickets (in the done lane of their project: list them with unlisted include or only, or with where project and lane)",
  },
  // 番号は、プロジェクトのプレフィクスを付けた見せ方（プロジェクトが読めなければプレフィクス無しの 4 桁）
  aiBrief: (t, ctx) => {
    const project = ctx.record(PROJECT.id, t.project) as { prefix?: string } | "none"
    const label = ticketLabel(project === "none" ? "" : (project.prefix ?? ""), t.number)
    return `${label} ${t.name} [${[t.lane, ...t.tags].join(", ")}]`
  },
})

export { UNSORTED }
