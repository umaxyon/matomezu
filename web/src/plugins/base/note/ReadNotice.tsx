// 伝言が読まれた知らせ（ウィジェット note-read-notice。根に置き、何も描かない）: この窓の伝言が、AI に読まれた（readAt が無い物から有る物に変わった）のを見たら、
// マーキーのトーストで「AI が伝言を読みました」と知らせる。いくつかまとめて読まれても 1 回。読み込んだときから読まれていた物では知らせない
import { useEffect, useRef } from "react"
import type { Annotations } from "../../../core/annotation"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { NOTE, type NoteProps } from "."

// アノテーション all のうち、まだ読まれていない伝言の id
function unreadNotes(all: Annotations): Set<string> {
  const ids = new Set<string>()
  for (const list of Object.values(all))
    for (const a of list) if (a.annotation === NOTE.id && (a.props as NoteProps).readAt === undefined) ids.add(a.id)
  return ids
}

// 前に未読だった伝言 before のうち、今 all で読まれた物があるか
export function newlyRead(before: ReadonlySet<string>, all: Annotations): boolean {
  for (const list of Object.values(all))
    for (const a of list)
      if (a.annotation === NOTE.id && before.has(a.id) && (a.props as NoteProps).readAt !== undefined) return true
  return false
}

export function ReadNotice() {
  const annotations = useMatomezuState(s => s.annotations)
  const { showToast } = useActions()
  const before = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (before.current && newlyRead(before.current, annotations))
      showToast({ kind: "info", form: "marquee", message: kit.message("AI read the note") })
    before.current = unreadNotes(annotations)
  }, [annotations, showToast])
  return null
}
