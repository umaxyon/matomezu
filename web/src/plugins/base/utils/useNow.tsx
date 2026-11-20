// 今の時刻（ミリ秒）。時が経つと変わる表示のために、interval ミリ秒ごとに進める
import { useEffect, useState } from "react"

export function useNow(interval: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}
