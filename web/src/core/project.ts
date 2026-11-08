// プロジェクト: 名前を持つ論理的なフィルターの層。コントロールセンターが持ち、ブックは 1 つのプロジェクトに属する。
// プロジェクトの表は利用者のデータで、プラグインが足す定義ではない。name は文言の鍵（画面に出すときは t() を通す）
import { z } from "zod"
import type { Declined } from "./def/action"

// 最初からあるプロジェクトの id
export const DEFAULT_PROJECT = "default"

export const ProjectSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
})
export type Project = z.output<typeof ProjectSchema>

// プロジェクトの表: プロジェクトの並び
export type Projects = readonly Project[]

export const PROJECTS: Projects = [{ id: DEFAULT_PROJECT, name: "Default" }]

// 表にあるプロジェクトの id か
export const isProject = (id: string): boolean => PROJECTS.some(p => p.id === id)

// 表に無いプロジェクトの id（無ければ空）
export const unknownProjects = (ids: readonly string[]): string[] => ids.filter(id => !isProject(id))

// 表に無いプロジェクトを指したときの断りの文（AI に返す）
export function unknownProjectText(ids: readonly string[]): string {
  return `no such project: ${ids.join(", ")} (known: ${PROJECTS.map(p => p.id).join(", ")})`
}

// 表に無いプロジェクトを指したアクションの断り（run が返す）
export const declineProjects = (ids: readonly string[]): Declined => ({ declined: unknownProjectText(ids) })
