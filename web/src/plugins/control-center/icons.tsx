// 画面で使う線画のアイコン（SVG。色は currentColor、大きさは各アイコンが決める）
import { LineIcon } from "../base/ui"

export const MailIcon = () => (
  <LineIcon size={15}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3.5 7l8.5 6.5L20.5 7" />
  </LineIcon>
)

export const LibraryIcon = () => (
  <LineIcon size={15}>
    <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" />
    <path d="M12 6.5v13" />
  </LineIcon>
)

export const ProjectIcon = () => (
  <LineIcon size={15}>
    <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </LineIcon>
)

export const AvatarIcon = () => (
  <LineIcon size={32} stroke={1.5}>
    <circle cx="12" cy="12" r="10.5" />
    <circle cx="12" cy="9.5" r="3.4" />
    <path d="M5.8 19.2c1.2-3.2 3.6-4.7 6.2-4.7s5 1.5 6.2 4.7" />
  </LineIcon>
)

// 退室（ドアから外へ出る矢印）
export const LeaveIcon = () => (
  <LineIcon size={16} stroke={1.7}>
    <path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4" />
    <path d="M14 8l4 4-4 4M18 12H9.5" />
  </LineIcon>
)

// 丸い矢印（コンテキストをクリアする指示を送る）
export const ClearIcon = () => (
  <LineIcon size={16} stroke={1.7}>
    <path d="M5 12a7 7 0 1 0 2.05-4.95" />
    <path d="M5 4v4h4" />
  </LineIcon>
)

// ごみ箱（空室のワークルームを削除する）
export const TrashIcon = () => (
  <LineIcon size={16} stroke={1.7}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />
  </LineIcon>
)

export const SearchIcon = () => (
  <LineIcon size={15}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5.5 5.5" />
  </LineIcon>
)
