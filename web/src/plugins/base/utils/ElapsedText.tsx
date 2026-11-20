// 時刻 at から経った時間（「5 分前」など）を出す文字。時間が経つと言葉が変わるので、一定の間隔で描き直す（interval ミリ秒。既定は 30 秒）
import { useElapsed } from "./useElapsed"
import { useNow } from "./useNow"

export function Elapsed({ at, interval = 30_000 }: { at: string; interval?: number }) {
  useNow(interval)
  return <>{useElapsed()(at)}</>
}
