//go:build !windows

package firewall

// ForThisOS は、この OS の規則を読み書きする物（Windows のほかは、matomezu が規則を作らないので無い）
func ForThisOS() Rules { return nil }
