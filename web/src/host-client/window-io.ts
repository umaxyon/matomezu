// 画面がブラウザの窓に頼む物のうち、インスタンスに渡す口: クリップボードに文字を書く・窓のタイトルを読む・替える・窓を読み込み直す・
// 利用者が端末で打つ matomezu の名前（常駐が index.html の meta に書く。Windows で npm の .cmd なら matomezu.cmd。画面 cookie が無くても読める）。
// クリップボードの無い窓（安全でない所から開いたなど）には、書く口を渡さない（インスタンスは E404 で断る）
import type { ClipboardUse } from "../core/clipboard"

// COMMAND_META は、名前の meta の name（internal/server/command.go と同じ）
const COMMAND_META = "matomezu-command"

export interface WindowIo {
  copyText?: (text: string) => Promise<void>
  requestCopyEvent?: () => boolean
  clipboardEventOf?: (key: string) => ClipboardUse | undefined
  clipboardEventWaitMs?: number
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
    // メニューから呼んだコピーにも copy のイベントを起こす（押した処理の中で呼べば、Chromium はイベントを起こす。古い口だが、代わりの口は独自の形式を書けない）
    requestCopyEvent: () => document.execCommand("copy"),
    clipboardEventOf: key => CLIPBOARD_KEYS[key],
    clipboardEventWaitMs: CLIPBOARD_EVENT_WAIT_MS,
    setWindowTitle: title => {
      document.title = title
    },
    windowTitle: () => document.title,
    reloadWindow: () => window.location.reload(),
  }
}

// ブラウザがクリップボードのイベントを起こすキーと、起こすイベント（Mac の Command は Mod。Windows の Insert・Delete の組も起こす）。
// イベントの来る早さはブラウザで違う（Linux の Chromium ではキーを押した処理の続きで来るが、Mac の Chrome では Command+V が編集のメニューを通るので 20 ms ほどあとに来る）
// キーで待たせたコマンドが、そのイベントを待つ長さ（ミリ秒）。来なければ、インスタンスはクリップボード無しで行う（イベントを起こさないブラウザでも、窓の写しで効くように）。
// 遅いブラウザでも来るよう、人が待ったと感じない長さで大きめに取る
export const CLIPBOARD_EVENT_WAIT_MS = 300

export const CLIPBOARD_KEYS: Readonly<Record<string, ClipboardUse>> = {
  "Mod+C": "copy",
  "Mod+Insert": "copy",
  "Mod+X": "cut",
  "Shift+Delete": "cut",
  "Mod+V": "paste",
  "Shift+Insert": "paste",
}
