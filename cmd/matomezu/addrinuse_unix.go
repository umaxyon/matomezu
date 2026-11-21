//go:build !windows

package main

import "syscall"

// errAddrInUse は、待ち受けるポートをほかが使っているときの OS の誤り
const errAddrInUse = syscall.EADDRINUSE
