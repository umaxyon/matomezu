package main

import (
	"os"
	"syscall"
)

// stdoutRead は、標準出力の読み手（watch の行を読む AI のプログラム）がまだ居るか。0 バイトを書き、パイプの読み手が閉じていれば失敗する。
// Windows では、AI のプログラムが終わっても、間に挟まる中継（Git の bash・volta・node の入口）が残ることがあり、親の列だけでは終わりが分からない
func stdoutRead() bool {
	var n uint32
	return syscall.WriteFile(syscall.Handle(os.Stdout.Fd()), nil, &n, nil) == nil
}
