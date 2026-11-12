// 枠のない小さなアイコンボタン（歯車・最大化など）。label は読み上げと吹き出しの文
import type { ComponentProps } from "react"
import styles from "./IconButton.module.css"

export function IconButton({
  label,
  small,
  className,
  ...rest
}: ComponentProps<"button"> & { label: string; small?: boolean }) {
  const classes = [styles.icon, small ? styles.small : "", className ?? ""].filter(Boolean).join(" ")
  return <button type="button" className={classes} aria-label={label} title={label} {...rest} />
}
