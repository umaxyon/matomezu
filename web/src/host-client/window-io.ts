// 画面がブラウザの窓に頼む物のうち、インスタンスに渡す口: クリップボードに文字を書く・窓のタイトルを替える。
// クリップボードの無い窓（安全でない所から開いたなど）には、書く口を渡さない（インスタンスは E404 で断る）

export interface WindowIo {
  copyText?: (text: string) => Promise<void>
  setWindowTitle: (title: string) => void
}

export function browserWindowIo(): WindowIo {
  const clipboard = navigator.clipboard as Clipboard | undefined
  return {
    ...(clipboard ? { copyText: (text: string) => clipboard.writeText(text) } : {}),
    setWindowTitle: title => {
      document.title = title
    },
  }
}
