package peer

import "syscall"

// errAddrInUse は、待ち受けるポートをほかが使っているときの OS の誤り（Winsock の WSAEADDRINUSE）
const errAddrInUse = syscall.Errno(10048)
