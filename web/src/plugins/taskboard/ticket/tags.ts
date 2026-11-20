// チケットに付いたタグを、プロジェクトのタグの順に並べる（無いタグは外す）。カードとチケットスクリーンが使う
import type { z } from "zod"
import type { Project } from "../project"
import type { TICKET } from "./ticket"

type Tag = Project["tags"][number]

export const tagsOf = (project: Project, ticket: Pick<z.output<typeof TICKET.record>, "tags">): Tag[] =>
  project.tags.filter(t => ticket.tags.includes(t.id))
