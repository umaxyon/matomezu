package peer

import (
	"errors"
	"syscall"
)

// portTaken は、待ち受けるポートをほかが使っていて取れない OS の誤りか。Winsock の WSAEADDRINUSE（10048）と、
// Windows が Hyper-V や WSL などのために取り置いたポートの範囲（netsh interface ipv4 show excludedportrange）に当たったときの WSAEACCES（10013）
func portTaken(err error) bool {
	return errors.Is(err, syscall.Errno(10048)) || errors.Is(err, syscall.Errno(10013))
}
