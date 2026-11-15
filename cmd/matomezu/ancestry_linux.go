package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// osProcTable は、/proc/<pid>/stat から、親・名前（comm）・起動した時（起動からの clock tick）を読む
func osProcTable(pid int) (procInfo, bool) {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return procInfo{}, false
	}
	s := string(b)
	l, r := strings.IndexByte(s, '('), strings.LastIndexByte(s, ')')
	if l < 0 || r < l || r+2 > len(s) {
		return procInfo{}, false
	}
	f := strings.Fields(s[r+2:]) // state から後ろ。ppid は 2 つめ、starttime は 20 番め
	if len(f) < 20 {
		return procInfo{}, false
	}
	parent, _ := strconv.Atoi(f[1])
	started, _ := strconv.ParseInt(f[19], 10, 64)
	return procInfo{parent: parent, name: s[l+1 : r], started: started}, true
}
