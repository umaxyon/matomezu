// 表に無いプロジェクトを指したときの断り（プロジェクトの表は core/project.ts）
import type { Declined } from "../../core/def/action"
import { isProject, PROJECTS } from "../../core/project"

// 表に無いプロジェクトの id（無ければ空）
export const unknownProjects = (ids: readonly string[]): string[] => ids.filter(id => !isProject(id))

// 表に無いプロジェクトを指したときの断りの文（AI に返す）
export function unknownProjectText(ids: readonly string[]): string {
  return `no such project: ${ids.join(", ")} (known: ${PROJECTS.map(p => p.id).join(", ")})`
}

// 表に無いプロジェクトを指したアクションの断り（run が返す）
export const declineProjects = (ids: readonly string[]): Declined => ({ declined: unknownProjectText(ids) })
