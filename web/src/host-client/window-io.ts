// 画面がブラウザの窓に頼む物のうち、インスタンスに渡す口: クリップボードに文字を書く・窓のタイトルを替える。テストでは差し替える

export interface WindowIo {
  copyText(text: string): Promise<void>
  setWindowTitle(title: string): void
}

export const browserWindowIo: WindowIo = {
  copyText: text => navigator.clipboard.writeText(text),
  setWindowTitle: title => {
    document.title = title
  },
}
