// 伝言: 利用者がブックの物に付けて AI に伝える文の、アノテーションの種類（core/def/annotation.ts）。付ける・変える・消すのは利用者だけ（userOnly）で、AI は読んだと知らせるだけ。
// 返事は書かない。文の無い印はマーク（mark/）。
// AI が読んだかは readAt（AI が読んだ時点）で持ち、利用者が文か付ける先を変えると未読に戻る。
// 読まれたあと、利用者トリガートークがあると会話の時点 talkedAt を持ち、そこから伝言期限（利用者の設定 note-expiry）が過ぎると消える。
// ロック中のブックにも付けられる（ロックはアノテーションを止めない）
// 右クリックのメニューのコマンド note-new（押した物に伝言を書き始める）と、右サイドパネルで書いた伝言を送るコマンド note-send（Mod+Enter）もここ
import { z } from "zod"
import type { Annotation } from "../../../core/annotation"
import { type CommandContext, NO_BOOK, NO_PAGE } from "../../../store/commands/def"
import { anchorsFor } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { openRightSidePanelIn, RIGHT_SIDE_PANEL_STATE, type RightSidePanelOpen } from "../right-side-panel/state"
import { freshId } from "../utils/ids"
import { type InPlaceDraft, inPlaceText } from "../utils/in-place"
import { refusalMessage } from "../utils/refusal"
import { expiryFrom, NOTE_EXPIRY } from "./expiry"
import { NEW_NOTE, NOTE_PANEL_ID } from "./panel-id"

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
  talkedAt: z.string().optional(), // 読まれたあと、利用者トリガートークがあった時点（無ければ、まだ無い）
})
export type NoteProps = z.output<typeof NoteSchema>

export const NOTE = kit.defineAnnotation({
  id: "note",
  title: "Note",
  aiDescription:
    "A note the user put on things of a page (anchors, the ids of things on that page) to tell AI something; its actions take on.page, the page it is on (page in read_book, read_page and view). text is what the user wants AI to know. There is no reply: take it in (a note told at the user's talk may be cut short, ending with … and its length: read the page for the whole text before you answer it), then call note-read to tell the user it reached you (it stays, marked read; keep it in mind). addedAt is when the user put it on. readAt is when AI read it (none: unread; the user changing the text or the things it is on makes it unread again). talkedAt is when the user talked to AI after it was read; the note is removed when the user's note expiry has passed since then (unless it is set to never).",
  props: NoteSchema,
  awaits: p => p.readAt === undefined,
  aiBrief: p => p.text, // 利用者の文（長ければ core が切る）
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
  run: ({ page, annotations }, args, ctx) => {
    const id = freshId(
      ctx.newId,
      annotations.map(a => a.id),
    )
    const props: NoteProps = { text: args.text, bubble: args.bubble ?? true, addedAt: ctx.now }
    const note: Annotation = { id, annotation: NOTE.id, anchors: [...new Set(args.anchors)], props }
    return { next: { page, annotations: [...annotations, note] }, result: { note: id } }
  },
})

export const NOTE_UPDATE = kit.defineAction({
  id: "note-update",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Change a note's text, the things it is on (anchors; the bubble stands by the last), or whether it shows a bubble (only the user). Changing the text or the things it is on makes it unread again. Refused if nothing changes.",
  title: "Change note",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    note: z.string().min(1),
    text: TEXT.optional(),
    anchors: z.array(z.string().min(1)).min(1).optional(),
    bubble: z.boolean().optional(),
  }),
  run: ({ page, annotations }, { note, anchors, ...change }) => {
    const found = findNote(annotations, note)
    const moved = anchors ? [...new Set(anchors)] : found?.anchors
    const sameAnchors =
      !!found && !!moved && moved.length === found.anchors.length && moved.every((id, i) => found.anchors[i] === id)
    const next = changeNote(annotations, note, p => {
      const changed = { ...p, ...change }
      const sameText = changed.text === p.text
      if (sameText && sameAnchors) return changed.bubble === p.bubble ? null : changed
      const { readAt: _, talkedAt: __, ...unread } = changed
      return unread
    })
    const placed =
      next && moved ? next.map(a => (a.id === note && a.annotation === NOTE.id ? { ...a, anchors: moved } : a)) : next
    return placed ? { next: { page, annotations: placed }, result: {} } : null
  },
})

export const NOTE_READ = kit.defineAction({
  id: "note-read",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Tell the user a note reached AI: it is marked read. Refused if it is already read.",
  title: "Mark note read",
  target: "annotations",
  args: ID_ARGS,
  run: ({ page, annotations }, args, ctx) => {
    const props = noteIn(annotations, args.note)
    if (!props || props.readAt) return null
    const next = changeNote(annotations, args.note, p => ({ ...p, readAt: ctx.now }))
    return next ? { next: { page, annotations: next }, result: {} } : null
  },
})

// 利用者トリガートークのとき（matomezu が行う）: 読まれていて、まだ会話の時点の無い伝言に、会話の時点を付ける（そこから伝言期限が数え始まる）
export const NOTE_TALKED = kit.defineAction({
  id: "note-talked",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Done by matomezu when the user talks to AI: the notes AI has read start their expiry.",
  title: "Start note expiry",
  target: "annotations",
  userOnly: true,
  runsWhenUserTalks: true,
  args: z.strictObject({}),
  run: ({ page, annotations }, _args, ctx) => {
    let changed = false
    const next = annotations.map(a => {
      if (a.annotation !== NOTE.id) return a
      const p = a.props as NoteProps
      if (!p.readAt || p.talkedAt) return a
      changed = true
      return { ...a, props: { ...p, talkedAt: ctx.now } }
    })
    return changed ? { next: { page, annotations: next }, result: {} } : null
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
  run: ({ page, annotations }, args) => {
    const next = withoutNote(annotations, args.note)
    return next ? { next: { page, annotations: next }, result: {} } : null
  },
})
export { type NOTE_BIRDS, NOTE_STATES } from "./birds-state"
export { NOTE_EXPIRY } from "./expiry"

// 伝言のコマンド: 右クリックで押した物（アンカーの付いた物）に、伝言を新しく書き始める（右サイドパネルを伝言の中身で開く）。UI マッピングの anchorMenu に置く
// 押した物 anchor から書き始める: 付ける先は、押した物が選んでいる物のうちなら選んでいる物の全部（押した物を最後に）、でなければ押した物だけ。
// 伝言の中身は選択に従うので、開くと右サイドパネルが選択を付ける先にする（カレントは押した物）
export const NOTE_NEW = kit.defineCommand({
  id: "note-new",
  title: "Note to AI",
  performs: [NOTE_ADD.id],
  run: (ctx, a, anchor: string) =>
    openRightSidePanelIn(ctx, a, {
      widget: NOTE_PANEL_ID,
      subject: NEW_NOTE,
      anchors: anchorsFor(anchor, ctx.stage.selection),
      current: anchor,
    }),
  when: ctx => ctx.book !== NO_BOOK,
})

// 右サイドパネルで書いている伝言の文（target は伝言の id。新しく書く伝言なら NEW_NOTE）。無ければ、伝言の今の文のまま。
// 書くのはパネルのテキストForm で、パネルの中身が外れたら消す（閉じたときと、外で文が変わって書き始め直すとき）
export const NOTE_DRAFT = kit.definePluginStateOf<InPlaceDraft>()({ id: "note-draft", scope: "stage" })

// 付ける先の並び: カレントを最後にする（吹き出しはカレントに出る）
export const orderedAnchors = (open: RightSidePanelOpen): string[] =>
  open.anchors.includes(open.current)
    ? [...open.anchors.filter(id => id !== open.current), open.current]
    : [...open.anchors]

// 右サイドパネルの伝言 open で、文 text を送るときに行うアクションと引数（送れなければ null）。note は付けた伝言（新しく書く伝言なら無し）。
// 新しく書く伝言は、文が書けていて付ける先があれば付ける。付けた伝言は、付ける先があり、文が変わったか付ける先が動いたら、変わった物だけを送る
export function noteSendOf(
  open: RightSidePanelOpen,
  text: string,
  note: Annotation | undefined,
):
  | { action: typeof NOTE_ADD.id; args: { anchors: string[]; text: string } }
  | { action: typeof NOTE_UPDATE.id; args: { note: string; text?: string; anchors?: string[] } }
  | null {
  const next = orderedAnchors(open)
  const written = NoteTextSchema.safeParse(text).success
  if (next.length === 0) return null
  if (!note) return open.subject === NEW_NOTE && written ? { action: NOTE_ADD.id, args: { anchors: next, text } } : null
  const textChanged = written && text !== (note.props as NoteProps).text
  const moved = next.length !== note.anchors.length || next.some((a, i) => note.anchors[i] !== a)
  if (!textChanged && !moved) return null
  return {
    action: NOTE_UPDATE.id,
    args: { note: note.id, ...(textChanged ? { text } : {}), ...(moved ? { anchors: next } : {}) },
  }
}

// ctx のステージの右サイドパネルで書いている伝言を、送るときの物（伝言を出していないか、送れなければ null）
function sendIn(ctx: CommandContext) {
  const open = ctx.pluginState(RIGHT_SIDE_PANEL_STATE)
  if (!open || open.widget !== NOTE_PANEL_ID) return null
  const note = ctx.annotations.find(a => a.id === open.subject && a.annotation === NOTE.id)
  if (!note && open.subject !== NEW_NOTE) return null
  const text = inPlaceText(ctx, NOTE_DRAFT, open.subject) ?? (note ? (note.props as NoteProps).text : "")
  return noteSendOf(open, text, note)
}

// 右サイドパネルで書いている伝言を送る（新しく書く伝言は付け、付けた伝言は再送する）。送れたら閉じ、断られたらトーストで知らせる
export const NOTE_SEND = kit.defineCommand({
  id: "note-send",
  title: "Send",
  performs: [NOTE_ADD.id, NOTE_UPDATE.id],
  run: (ctx, a) => {
    const send = sendIn(ctx)
    if (!send || ctx.page === NO_PAGE) return
    const done = a.perform(send.action, send.args as never, { page: ctx.page.id })
    if (!done.ok) {
      a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("The note was refused")) })
      return
    }
    a.updatePluginState(NOTE_DRAFT, () => undefined)
    a.updatePluginState(RIGHT_SIDE_PANEL_STATE, () => undefined)
  },
  when: ctx => sendIn(ctx) !== null,
})

// 伝言のテキストForm が名乗る範囲（送るキーをここに置く）
export const NOTE_TEXT_KEY_SCOPE = kit.defineKeyScope({ id: "note-text", title: "Note text", commandsFrom: "stage" })

export const NOTE_KEYS = [
  kit.defineKey({ id: "note-send-mod-enter", key: "Mod+Enter", command: NOTE_SEND.id, scope: NOTE_TEXT_KEY_SCOPE.id }),
]
