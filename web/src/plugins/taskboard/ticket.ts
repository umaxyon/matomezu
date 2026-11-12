// チケット: タスクボードの 1 枚。1 枚が 1 件のレコードで、プロジェクトの id（project）を持つ。
// 番号（number）はプロジェクトごとの連番で、使い回さない（番号の表の区切りがプロジェクトの id）。
// レーン（lane。レーンの id か未分類）・タグ（tag。タグの id かタグなし）は id を書いたまま残し、読む側が「無い物は未分類・タグなし」とする
import { z } from "zod"
import { kit } from "./kit"
import { NO_TAG, PROJECT, UNSORTED } from "./project"

export const TICKET_NAME_MAX = 50
export const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const
export const PRIORITY_DEFAULT = "medium"

export const TICKET = kit.defineSubject({
  id: "ticket",
  title: "ticket",
  aiDescription:
    "A ticket: one card of a project's task board. It has the project's id, a number (counted for each project and never reused), a name, a body (markdown), the lane (a lane's id of the project, or unsorted), the tag (a tag's id of the project, or none), the priority (lowest, low, medium, high or highest) and the times it was filed and last changed. A lane or tag that is not there any more reads as unsorted or none.",
  record: z.strictObject({
    id: z.string().min(1),
    project: z.string().min(1),
    number: z.number().int().min(1),
    name: z.string().trim().min(1).max(TICKET_NAME_MAX),
    body: z.string(),
    lane: z.string().min(1),
    tag: z.string().min(1),
    priority: z.enum(PRIORITIES),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  refers: t => [{ subject: PROJECT.id, id: t.project }],
  numbered: true,
  aiOrder: t => t.number,
  aiBrief: t => `${t.number} ${t.name} [${t.lane}${t.tag === NO_TAG ? "" : `, ${t.tag}`}]`,
})

export { NO_TAG, UNSORTED }
