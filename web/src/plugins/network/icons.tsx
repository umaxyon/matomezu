// network の絵: ペアリングを解く（切れた鎖）、AI 用ホストリストに載せる（開いた目）・隠す（斜線の入った目）
import { LineIcon } from "../base/ui"

export const UnpairIcon = () => (
  <LineIcon size={16} stroke={1.7}>
    <path d="M9.5 14.5l-2 2a3 3 0 0 1-4.2-4.2l2.6-2.6a3 3 0 0 1 3.6-.5" />
    <path d="M14.5 9.5l2-2a3 3 0 0 1 4.2 4.2l-2.6 2.6a3 3 0 0 1-3.6.5" />
    <path d="M5 5l2 2M19 19l-2-2M8 3v2M16 21v-2" />
  </LineIcon>
)

const EYE = (
  <>
    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>
)

export const EyeIcon = ({ size = 16 }: { size?: number }) => <LineIcon size={size}>{EYE}</LineIcon>

export const EyeHiddenIcon = ({ size = 16 }: { size?: number }) => (
  <LineIcon size={size}>
    {EYE}
    <path d="M4 20L20 4" />
  </LineIcon>
)
