// 土台のプラグインのコマンドのアイコン（メニューに出す）
const icon = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {paths}
  </svg>
)

const SPLIT = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M12 5v14" />
  </>,
)

export const COMMAND_ICONS = {
  "stage.master": icon(
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>,
  ),
  "stage.split": SPLIT,
  "stage.unsplit": SPLIT,
  "book.open": icon(<path d="M3.5 5.5h6l2 2h9v11h-17z" />),
}
