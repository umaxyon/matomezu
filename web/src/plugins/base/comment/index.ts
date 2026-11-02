// コメント: ブックの物に付ける、アノテーションの種類（core/def/annotation.ts）。付けるのは利用者だけ（userOnly）で、利用者も AI も返事を続けて書け、誰でも消せる。
// 付けるときに、返事が欲しい（reply）か、指すだけ（point。伝わったら AI が消す）かを選ぶ。文の無いコメントはマーク。
// AI が読んだかは readAt（AI が読んだ時点）で持ち、利用者が書き込むと未読に戻る。ロック中のブックにも付けられる（ロックはアノテーションを止めない）
import { z } from "zod"
import type { Annotation } from "../../../core/annotation"
import type { ActionContext } from "../../../core/def/action"
import { freshId } from "../../../core/ids"
import { kit } from "../kit"

const PostSchema = z.strictObject({
  by: z.enum(["user", "ai"]),
  text: z.string().max(2000),
  at: z.string(),
})

const CommentSchema = z.strictObject({
  ask: z.enum(["reply", "point"]), // 求めること: 返事が欲しい・指すだけ
  bubble: z.boolean(), // 吹き出しを出すか（出さなければマークだけ）
  posts: z.array(PostSchema).min(1), // 書き込み（最初が付けた人の文。空ならマーク）
  readAt: z.string().optional(), // AI が読んだ時点（無ければ未読）
})
export type CommentProps = z.output<typeof CommentSchema>

export const COMMENT = kit.defineAnnotation({
  id: "comment",
  title: "Comment",
  props: CommentSchema,
})

const by = (ctx: ActionContext) => ctx.by ?? "user"

// id のコメントを change で変えた並び（無いか、コメントでなければ null。change が null を返しても断る）
function changeComment(
  annotations: readonly Annotation[],
  id: string,
  change: (props: CommentProps) => CommentProps | null,
): Annotation[] | null {
  const at = annotations.findIndex(a => a.id === id && a.annotation === COMMENT.id)
  const found = annotations[at]
  if (!found) return null
  const props = change(found.props as CommentProps)
  return props ? annotations.map(a => (a === found ? { ...found, props } : a)) : null
}

const ID_ARGS = z.strictObject({ comment: z.string().min(1) })

export const COMMENT_ADD = kit.defineAction({
  id: "comment-add",
  attach: { annotations: [COMMENT.id] },
  aiDescription:
    "Add a comment to things in the book (only the user adds comments): anchors are the ids of the things it is about (items, lines, list rows, tree nodes, folder rows; one or more, not pages). ask is reply (an answer is wanted) or point (only pointing at them; remove it once understood). text may be empty (a mark). bubble (default true) shows its text in a bubble. Returns the new comment's id.",
  title: "Add comment",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    anchors: z.array(z.string().min(1)).min(1),
    text: z.string().max(2000),
    ask: z.enum(["reply", "point"]),
    bubble: z.boolean().optional(),
  }),
  run: ({ book, annotations }, args, ctx) => {
    const id = freshId(
      ctx.newId,
      annotations.map(a => a.id),
    )
    const props: CommentProps = {
      ask: args.ask,
      bubble: args.bubble ?? true,
      posts: [{ by: "user", text: args.text, at: ctx.now }],
    }
    const comment: Annotation = { id, annotation: COMMENT.id, anchors: [...new Set(args.anchors)], props }
    return { next: { book, annotations: [...annotations, comment] }, result: { comment: id } }
  },
})

export const COMMENT_REPLY = kit.defineAction({
  id: "comment-reply",
  attach: { annotations: [COMMENT.id] },
  aiDescription:
    "Write a reply under a comment (text not empty). A reply by the user makes the comment unread again; a reply by AI marks it read.",
  title: "Reply to comment",
  target: "annotations",
  args: z.strictObject({ comment: z.string().min(1), text: z.string().min(1).max(2000) }),
  run: ({ book, annotations }, args, ctx) => {
    const who = by(ctx)
    const next = changeComment(annotations, args.comment, ({ readAt: _, ...p }) => ({
      ...p,
      posts: [...p.posts, { by: who, text: args.text, at: ctx.now }],
      ...(who === "ai" ? { readAt: ctx.now } : {}),
    }))
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})

export const COMMENT_READ = kit.defineAction({
  id: "comment-read",
  attach: { annotations: [COMMENT.id] },
  aiDescription: "Mark a comment as read by AI, to tell the user it has been seen. Refused if it is already read.",
  title: "Mark comment read",
  target: "annotations",
  args: ID_ARGS,
  run: ({ book, annotations }, args, ctx) => {
    const next = changeComment(annotations, args.comment, p => (p.readAt ? null : { ...p, readAt: ctx.now }))
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})

export const COMMENT_UPDATE = kit.defineAction({
  id: "comment-update",
  attach: { annotations: [COMMENT.id] },
  aiDescription: "Change whether a comment shows its text in a bubble (bubble). Refused if nothing changes.",
  title: "Change comment",
  target: "annotations",
  args: z.strictObject({ comment: z.string().min(1), bubble: z.boolean() }),
  run: ({ book, annotations }, args) => {
    const next = changeComment(annotations, args.comment, p =>
      p.bubble === args.bubble ? null : { ...p, bubble: args.bubble },
    )
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})

export const COMMENT_REMOVE = kit.defineAction({
  id: "comment-remove",
  attach: { annotations: [COMMENT.id] },
  aiDescription:
    "Remove a comment, by the user or by AI (AI removes a point comment once it has understood it, and may remove one it has answered).",
  title: "Remove comment",
  target: "annotations",
  args: ID_ARGS,
  run: ({ book, annotations }, args) => {
    const next = annotations.filter(a => !(a.id === args.comment && a.annotation === COMMENT.id))
    return next.length === annotations.length ? null : { next: { book, annotations: next }, result: {} }
  },
})
