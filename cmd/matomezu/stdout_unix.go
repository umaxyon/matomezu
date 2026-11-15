//go:build !windows

package main

// stdoutRead は、標準出力の読み手がまだ居るか。Unix では、起動したときの親の列で終わりを見るので、いつも居ると答える
func stdoutRead() bool { return true }
