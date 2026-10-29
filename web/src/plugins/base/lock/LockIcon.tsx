// 鍵のアイコン（ロック中のページタブとブックの名前、設定のダイアログのロックの切り替えに出す）。open なら外れた鍵
export function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        d={open ? "M5 7V5a3 3 0 0 1 5.8-1" : "M5 7V5a3 3 0 0 1 6 0v2"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}
