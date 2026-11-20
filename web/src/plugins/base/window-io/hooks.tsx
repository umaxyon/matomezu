// 画面がブラウザの窓に頼む物（ホストクライアントがインスタンスに渡した口）を、見た目から使うフック

import { useEffect } from "react"
import { useInstance } from "../../../ui/store-context"

// ブラウザのクリップボードに文字を書く関数。書けなければ投げる
export function useCopyText(): (text: string) => Promise<void> {
  return useInstance().copyText
}

// 描いている間、窓のタイトル（ブラウザのタブとタイトルバーに出る文字）を title にする
export function useWindowTitle(title: string): void {
  const set = useInstance().setWindowTitle
  useEffect(() => set(title), [set, title])
}
