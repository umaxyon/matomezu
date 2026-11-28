//go:build !windows

package peer

import (
	"errors"
	"syscall"
)

// portTaken は、待ち受けるポートをほかが使っていて取れない OS の誤りか
func portTaken(err error) bool { return errors.Is(err, syscall.EADDRINUSE) }
