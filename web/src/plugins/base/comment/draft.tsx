// コメントの下書き（書いている途中のコメント）: base のステージの画面の状態の commentDraft に、付ける先を持つ。ブックのデータには入れない。
// 右クリックのメニューの置き場が、押した物にアンカーが付いていれば「コメント」を出し、押すと下書きを始める。
// そのステージのコメントのレイヤーが、付ける先の最後の物のそばに吹き出しで出す。付けるかやめると終わる
import { useCallback } from "react"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"

export interface CommentDraft {
  anchors: readonly string[] // 付ける先（吹き出しは最後の物のそばに出す）
}

const draftIn = (state: unknown): CommentDraft | null =>
  (state as { commentDraft?: CommentDraft } | undefined)?.commentDraft ?? null

// そのステージのコメントの下書き（無ければ null）
export const useCommentDraft = (stage: string): CommentDraft | null => draftIn(useStageState(stage, kit))

// ステージのコメントの下書きを置く（null なら終える）関数
export function useSetCommentDraft(): (stage: string, draft: CommentDraft | null) => void {
  const read = useReadStageState(kit)
  const set = useSetStageState(kit)
  return useCallback(
    (stage, draft) => {
      const { commentDraft: _, ...rest } = (read(stage) as { commentDraft?: CommentDraft } | undefined) ?? {}
      set(stage, draft ? { ...rest, commentDraft: draft } : rest)
    },
    [read, set],
  )
}

// 付ける先: 押した物が選んでいる物のうちなら、選んでいる物の全部（選んだ順。吹き出しは最後に選んだ物に出す）、でなければ押した物だけ
export function anchorsFor(clicked: string, selection: readonly string[]): readonly string[] {
  return selection.includes(clicked) ? selection : [clicked]
}
