// 画面がブラウザの窓に頼む物（ホストクライアントがインスタンスに渡した口）を、見た目から使うフック

import { useEffect } from "react"
import { useInstance } from "../../../ui/store-context"

// ブラウザのクリップボードに文字を書く関数。書けなければ投げる
export function useCopyText(): (text: string) => Promise<void> {
  return useInstance().copyText
}

// 利用者が端末で打つ matomezu の名前（Windows で npm から入れたなら matomezu.cmd。matomezu.ps1 は PowerShell の既定で止まる）
export function useMatomezuCommand(): string {
  return useInstance().command
}

// 描いている間、窓のタイトル（ブラウザのタブとタイトルバーに出る文字）を title にする。描かなくなったら、替える前のタイトルに戻す
export function useWindowTitle(title: string): void {
  const instance = useInstance()
  useEffect(() => {
    const before = instance.windowTitle()
    instance.setWindowTitle(title)
    return () => instance.setWindowTitle(before)
  }, [instance, title])
}
