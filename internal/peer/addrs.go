package peer

import (
	"net"
	"slices"
)

// ReachableAddrs は、このマシンの、ほかのマシンから届きうる IPv4 の番地（ループバックとリンクローカルを除く。並びは番地の順）。
// ホストどうしの入口がどこで待っているかを画面に見せるのに使う
func ReachableAddrs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []string
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipn.IP.To4()
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, ip.String())
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}
