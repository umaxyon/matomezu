// 時刻 at から経った時間（「5 分前」など）を出す文字。時間が経つと言葉が変わるので、一定の間隔で描き直す（interval ミリ秒。既定は 30 秒）
import { useEffect, useState } from "react"
import { useElapsed } from "./useElapsed"

export function Elapsed({ at, interval = 30_000 }: { at: string; interval?: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick(n => n + 1), interval)
    return () => clearInterval(timer)
  }, [interval])
  return <>{useElapsed()(at)}</>
}
