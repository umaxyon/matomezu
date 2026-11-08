// プロジェクト: ブックと郵便を絞る、名前の付いた区切り。ブックと郵便は 1 つのプロジェクトに属する。
// 表は core の定数 PROJECTS で、プラグインが足す定義ではない。name は文言の鍵（画面に出すときは t() を通す）
import { z } from "zod"

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
