// 伝言: 利用者がブックの物に付けて AI に伝える文の、アノテーションの種類（core/def/annotation.ts）。付ける・変える・消すのは利用者だけ（userOnly）で、AI は読んだと知らせるだけ。
// 返事は書かない。文の無い印はマーク（mark/）。
// AI が読んだかは readAt（AI が読んだ時点）で持ち、利用者が文を変えると未読に戻る。
// 読まれたあと、利用者が AI に話しかけると会話の時点 talkedAt を持ち、そこから伝言期限（利用者の設定 note-expiry）が過ぎると消える。
// ロック中のブックにも付けられる（ロックはアノテーションを止めない）
import { z } from "zod"
import type { Annotation } from "../../../core/annotation"
import { freshId } from "../../../core/ids"
import { kit } from "../kit"
import { expiryFrom, NOTE_EXPIRY } from "./expiry"

// 伝える文（空白だけの文は書かない。画面の「付ける」「再送」も、これで押せるかを決める）
export const NoteTextSchema = z
  .string()
  .max(2000)
  .refine(s => s.trim() !== "")
const TEXT = NoteTextSchema

const NoteSchema = z.strictObject({
  text: TEXT, // 伝える文
  bubble: z.boolean(), // 吹き出しを出すか（出さなければ、たたんだ伝言の絵だけ）
  addedAt: z.string(), // 付けた時点
  readAt: z.string().optional(), // AI が読んだ時点（無ければ未読）
  talkedAt: z.string().optional(), // 読まれたあと、利用者が AI に話しかけた時点（無ければ、まだ話していない）
})
export type NoteProps = z.output<typeof NoteSchema>

export const NOTE = kit.defineAnnotation({
  id: "note",
  title: "Note",
  aiDescription:
    "A note the user put on things in a book (anchors) to tell AI something: text is what the user wants AI to know. There is no reply: take it in, then call note-read to tell the user it reached you (it stays, marked read; keep it in mind). addedAt is when the user put it on. readAt is when AI read it (none: unread; the user changing the text makes it unread again). talkedAt is when the user talked to AI after it was read; the note is removed when the user's note expiry has passed since then (unless it is set to never).",
  props: NoteSchema,
  awaits: p => p.readAt === undefined,
  expiresAt: (p, setting) => (p.talkedAt ? expiryFrom(p.talkedAt, setting(NOTE_EXPIRY.id)) : null),
  // 送信トレイでは文を出し、取消で消し、押すと右サイドパネルで開く
  listed: {
    addedAt: (p: NoteProps) => p.addedAt,
    text: (p: NoteProps) => p.text,
    withdraw: { action: kit.name("note-remove"), args: id => ({ note: id }) },
    panel: kit.name("note-panel"),
  },
})

// id の伝言（無いか、伝言でなければ undefined）
const findNote = (annotations: readonly Annotation[], id: string) =>
  annotations.find(a => a.id === id && a.annotation === NOTE.id)

// id の伝言の中身（無いか、伝言でなければ undefined）
const noteIn = (annotations: readonly Annotation[], id: string) =>
  findNote(annotations, id)?.props as NoteProps | undefined

// id の伝言を change で変えた並び（無いか、伝言でなければ null。change が null を返しても断る）
function changeNote(
  annotations: readonly Annotation[],
  id: string,
  change: (props: NoteProps) => NoteProps | null,
): Annotation[] | null {
  const found = findNote(annotations, id)
  if (!found) return null
  const props = change(found.props as NoteProps)
  return props ? annotations.map(a => (a === found ? { ...found, props } : a)) : null
}

// id の伝言を除いた並び（無ければ null）
function withoutNote(annotations: readonly Annotation[], id: string): Annotation[] | null {
  const next = annotations.filter(a => !(a.id === id && a.annotation === NOTE.id))
  return next.length === annotations.length ? null : next
}

const ID_ARGS = z.strictObject({ note: z.string().min(1) })

export const NOTE_ADD = kit.defineAction({
  id: "note-add",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Add a note to things in the book (only the user adds notes): anchors are the ids of the things it is about (items, lines, list rows, tree nodes, folder rows; one or more, not pages; the bubble stands by the last). bubble (default true) shows the start of the text in a bubble. Returns the new note's id.",
  title: "Add note",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    anchors: z.array(z.string().min(1)).min(1),
    text: TEXT,
    bubble: z.boolean().optional(),
  }),
  run: ({ book, annotations }, args, ctx) => {
    const id = freshId(
      ctx.newId,
      annotations.map(a => a.id),
    )
    const props: NoteProps = { text: args.text, bubble: args.bubble ?? true, addedAt: ctx.now }
    const note: Annotation = { id, annotation: NOTE.id, anchors: [...new Set(args.anchors)], props }
    return { next: { book, annotations: [...annotations, note] }, result: { note: id } }
  },
})

export const NOTE_UPDATE = kit.defineAction({
  id: "note-update",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Change a note's text, the things it is on (anchors; the bubble stands by the last), or whether it shows a bubble (only the user). Changing the text makes it unread again. Refused if nothing changes.",
  title: "Change note",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    note: z.string().min(1),
    text: TEXT.optional(),
    anchors: z.array(z.string().min(1)).min(1).optional(),
    bubble: z.boolean().optional(),
  }),
  run: ({ book, annotations }, { note, anchors, ...change }) => {
    const found = findNote(annotations, note)
    const moved = anchors ? [...new Set(anchors)] : found?.anchors
    const sameAnchors =
      !!found && !!moved && moved.length === found.anchors.length && moved.every((id, i) => found.anchors[i] === id)
    const next = changeNote(annotations, note, p => {
      const changed = { ...p, ...change }
      const same = changed.text === p.text && changed.bubble === p.bubble
      if (same) return sameAnchors ? null : p
      if (changed.text === p.text) return changed
      const { readAt: _, talkedAt: __, ...unread } = changed
      return unread
    })
    const placed =
      next && moved ? next.map(a => (a.id === note && a.annotation === NOTE.id ? { ...a, anchors: moved } : a)) : next
    return placed ? { next: { book, annotations: placed }, result: {} } : null
  },
})

export const NOTE_READ = kit.defineAction({
  id: "note-read",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Tell the user a note reached AI: it is marked read. Refused if it is already read.",
  title: "Mark note read",
  target: "annotations",
  args: ID_ARGS,
  run: ({ book, annotations }, args, ctx) => {
    const props = noteIn(annotations, args.note)
    if (!props || props.readAt) return null
    const next = changeNote(annotations, args.note, p => ({ ...p, readAt: ctx.now }))
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})

// 利用者が AI に話しかけたとき（matomezu が行う）: 読まれていて、まだ会話の時点の無い伝言に、会話の時点を付ける（そこから伝言期限が数え始まる）
export const NOTE_TALKED = kit.defineAction({
  id: "note-talked",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Done by matomezu when the user talks to AI: the notes AI has read start their expiry.",
  title: "Start note expiry",
  target: "annotations",
  userOnly: true,
  runsWhenUserTalks: true,
  args: z.strictObject({}),
  run: ({ book, annotations }, _args, ctx) => {
    let changed = false
    const next = annotations.map(a => {
      if (a.annotation !== NOTE.id) return a
      const p = a.props as NoteProps
      if (!p.readAt || p.talkedAt) return a
      changed = true
      return { ...a, props: { ...p, talkedAt: ctx.now } }
    })
    return changed ? { next: { book, annotations: next }, result: {} } : null
  },
})

export const NOTE_REMOVE = kit.defineAction({
  id: "note-remove",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Remove a note (only the user).",
  title: "Remove note",
  target: "annotations",
  userOnly: true,
  args: ID_ARGS,
  run: ({ book, annotations }, args) => {
    const next = withoutNote(annotations, args.note)
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})
