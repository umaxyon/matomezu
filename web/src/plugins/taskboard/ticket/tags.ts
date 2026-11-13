// チケットに付いたタグを、プロジェクトのタグの順に並べる（無いタグは外す）。カード・チケットスクリーン・並べ方「タグ」が使う
import type { z } from "zod"
import type { PROJECT } from "../project"
import type { TICKET } from "."

type Project = z.output<typeof PROJECT.record>
type Tag = Project["tags"][number]

export const tagsOf = (project: Project, ticket: Pick<z.output<typeof TICKET.record>, "tags">): Tag[] =>
  project.tags.filter(t => ticket.tags.includes(t.id))
