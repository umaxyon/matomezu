// マーク: 利用者がブックの物に付ける、文の無い印のアノテーション（core/def/annotation.ts）。付けるのは利用者だけ（userOnly）で、利用者も AI も外せる。
// 種類（kind）は 5 羽の鳥。1 つの物にマークは 1 つで、別のマークを付けると置き換わる。
// AI が読んだかは readAt で持ち、読まれていないマークは AI の応えを待つ物に数える（フックが知らせる）。会話で用が済んだら AI が外す
// 右クリックのメニューのコマンド mark-new（押した物のそばに種類を選ぶスタンドを出す）もここ
import { z } from "zod"
import { type Annotation, anchorsOf, NO_ANCHORS } from "../../../core/annotation"
import { BIRD_TITLES, type Bird } from "../birds"
import { startAnchorTarget } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { AnchorsArg } from "../utils/anchors"
import { freshId } from "../utils/ids"
import { hasOpenedPage } from "../utils/opened-page"
import { MARK_PICKER } from "./states"

// マークの種類。title は画面で見せる名前（文言の鍵）、ai は AI に伝える呼び方（利用者が旗の色や鳥の色・名前で呼ぶので、どれも書く）
export const MARK_KINDS = [
  { id: "tsunagidori", title: BIRD_TITLES.tsunagidori, ai: "tsunagidori: a green bird (petrel) with a green flag" },
  { id: "inko", title: BIRD_TITLES.inko, ai: "inko: a plum purple bird (parakeet) with a red flag" },
  { id: "buncho", title: BIRD_TITLES.buncho, ai: "buncho: a charcoal gray bird (Java sparrow) with a white flag" },
  { id: "suzume", title: BIRD_TITLES.suzume, ai: "suzume: a brown bird (sparrow) with a yellow flag" },
  { id: "fukurou", title: BIRD_TITLES.fukurou, ai: "fukurou: an indigo blue bird (barn owl) with a blue flag" },
] as const satisfies readonly { id: Bird; title: string; ai: string }[] // 鳥の種類は、マスコットの鳥（birds/）の id
export type MarkKind = (typeof MARK_KINDS)[number]["id"]

const KINDS = MARK_KINDS.map(k => k.id) as [MarkKind, ...MarkKind[]]

const MarkSchema = z.strictObject({
  kind: z.enum(KINDS),
  addedAt: z.string(), // 付けた時点
  readAt: z.string().optional(), // AI が読んだ時点（無ければ未読）
})
export type MarkProps = z.output<typeof MarkSchema>

export const MARK = kit.defineAnnotation({
  id: "mark",
  title: "Mark",
  aiDescription: `A mark the user put on things of a page (anchors, the ids of things on that page), with no text; its actions take on.page, the page it is on (page in read_book, read_page and view): the user points at them, and may call them by the mark's kind, its flag's color, the bird's color or the bird in the talk ("the yellow flag", "the green bird"). kind is one of: ${MARK_KINDS.map(k => k.ai).join("; ")}. addedAt is when the user put it on. readAt is when AI read it (none: unread): mark it read with mark-read. Once the talk about it is done, remove it with mark-remove.`,
  props: MarkSchema,
  // 読まれていないもの
  awaits: p => p.readAt === undefined,
  aiBrief: p => p.kind, // マークの種類（MARK_KINDS の id）
  // 送信トレイでは付けた物の名前を出し、取消で外す
  listed: {
    addedAt: (p: MarkProps) => p.addedAt,
    withdraw: { action: kit.name("mark-remove"), args: id => ({ mark: id }) },
  },
})

const ID_ARGS = z.strictObject({ mark: z.string().min(1) })

const isMark = (a: Annotation) => a.annotation === MARK.id

export const MARK_ADD = kit.defineAction({
  id: "mark-add",
  attach: { annotations: [MARK.id] },
  aiDescription:
    "Add a mark to things in the book (only the user adds marks): anchors are the ids of the things (one or more, not pages), kind is the mark's kind. A thing has one mark: the marks already on these things leave them. Returns the new mark's id.",
  title: "Add mark",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({ anchors: AnchorsArg, kind: z.enum(KINDS) }),
  run: ({ page, annotations }, args, ctx) => {
    const anchors = args.anchors
    // 付ける物から、ほかのマークを外す（付く物が無くなったマークは消す）
    const kept = annotations.flatMap(a => {
      if (!isMark(a) || !a.anchors.some(id => anchors.includes(id))) return [a]
      const rest = anchorsOf(a.anchors.filter(id => !anchors.includes(id)))
      return rest !== NO_ANCHORS ? [{ ...a, anchors: rest }] : []
    })
    const id = freshId(
      ctx.newId,
      annotations.map(a => a.id),
    )
    const props: MarkProps = { kind: args.kind, addedAt: ctx.now }
    const mark: Annotation = { id, annotation: MARK.id, anchors, props }
    return { next: { page, annotations: [...kept, mark] }, result: { mark: id } }
  },
})

export const MARK_READ = kit.defineAction({
  id: "mark-read",
  attach: { annotations: [MARK.id] },
  aiDescription: "Mark a mark as read by AI, so the user's hook stops telling about it. Refused if it is already read.",
  title: "Mark mark read",
  target: "annotations",
  args: ID_ARGS,
  run: ({ page, annotations }, args, ctx) => {
    const found = annotations.find(a => a.id === args.mark && isMark(a))
    if (!found || (found.props as MarkProps).readAt) return null
    const next = annotations.map(a =>
      a === found ? { ...a, props: { ...(a.props as MarkProps), readAt: ctx.now } } : a,
    )
    return { next: { page, annotations: next }, result: {} }
  },
})

export const MARK_REMOVE = kit.defineAction({
  id: "mark-remove",
  attach: { annotations: [MARK.id] },
  aiDescription: "Remove a mark, by the user or by AI (AI removes it once the talk about it is done).",
  title: "Remove mark",
  target: "annotations",
  args: ID_ARGS,
  run: ({ page, annotations }, args) => {
    const next = annotations.filter(a => !(a.id === args.mark && isMark(a)))
    return next.length === annotations.length ? null : { next: { page, annotations: next }, result: {} }
  },
})
export { type MARK_ARRIVING, type MARK_PICKER, MARK_STATES } from "./states"

// マークのコマンド: 右クリックで押した物（アンカーの付いた物）のそばに、マークの種類を選ぶスタンドを出す。UI マッピングの anchorMenu に置く
export const MARK_NEW = kit.defineCommand({
  id: "mark-new",
  title: "Show to AI",
  performs: [MARK_ADD.id],
  run: startAnchorTarget(MARK_PICKER),
  when: hasOpenedPage,
})
