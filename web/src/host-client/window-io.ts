// 画面がブラウザの窓に頼む物のうち、インスタンスに渡す口: クリップボードに文字を書く・窓のタイトルを読む・替える・窓を読み込み直す・
// 利用者が端末で打つ matomezu の名前（常駐が index.html の meta に書く。Windows で npm の .cmd なら matomezu.cmd。画面 cookie が無くても読める）。
// クリップボードの無い窓（安全でない所から開いたなど）には、書く口を渡さない（インスタンスは E404 で断る）

// COMMAND_META は、名前の meta の name（internal/server/command.go と同じ）
const COMMAND_META = "matomezu-command"

export interface WindowIo {
  copyText?: (text: string) => Promise<void>
  setWindowTitle: (title: string) => void
  windowTitle: () => string
  reloadWindow: () => void
  command?: string
}

export function browserWindowIo(): WindowIo {
  const clipboard = navigator.clipboard as Clipboard | undefined
  const command = document.querySelector<HTMLMetaElement>(`meta[name="${COMMAND_META}"]`)?.content
  return {
    ...(command ? { command } : {}),
    ...(clipboard ? { copyText: (text: string) => clipboard.writeText(text) } : {}),
    setWindowTitle: title => {
      document.title = title
    },
    windowTitle: () => document.title,
    reloadWindow: () => window.location.reload(),
  }
}
