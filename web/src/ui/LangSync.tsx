// 文書の言語（<html lang>）を、今の言語に合わせる
import { useEffect } from "react"
import { useApp } from "./store-context"

export function LangSync() {
  const lang = useApp(s => s.settings.lang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return null
}
