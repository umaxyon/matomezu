package main

import (
	"os"
	"syscall"
)

const synchronize = 0x00100000

// parentAlive は、起動したときの親が居る間 true を返す関数。起動したときに親を開いて持ち、その終わりを見る（プロセス id が使い回されても取り違えない）。
// 親を開けなければ、居ると答え続ける
func parentAlive() func() bool {
	h, err := syscall.OpenProcess(synchronize, false, uint32(os.Getppid()))
	if err != nil {
		return func() bool { return true }
	}
	return func() bool {
		ev, err := syscall.WaitForSingleObject(h, 0)
		return err != nil || ev == syscall.WAIT_TIMEOUT
	}
}
