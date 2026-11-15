package main

import (
	"syscall"
	"unsafe"
)

const processQueryLimitedInformation = 0x1000

// osProcTable は、プロセスの一覧（Toolhelp32）から親と名前を、GetProcessTimes から起動した時（100 ナノ秒）を読む
func osProcTable(pid int) (procInfo, bool) {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return procInfo{}, false
	}
	defer syscall.CloseHandle(snap)
	var e syscall.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = syscall.Process32First(snap, &e); err == nil; err = syscall.Process32Next(snap, &e) {
		if int(e.ProcessID) != pid {
			continue
		}
		started, ok := processStarted(pid)
		if !ok {
			return procInfo{}, false
		}
		return procInfo{parent: int(e.ParentProcessID), name: syscall.UTF16ToString(e.ExeFile[:]), started: started}, true
	}
	return procInfo{}, false
}

// processStarted は、プロセス pid が起動した時（1601 年からの 100 ナノ秒）
func processStarted(pid int) (int64, bool) {
	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(pid))
	if err != nil {
		return 0, false
	}
	defer syscall.CloseHandle(h)
	var created, exited, kernel, user syscall.Filetime
	if syscall.GetProcessTimes(h, &created, &exited, &kernel, &user) != nil {
		return 0, false
	}
	return int64(created.HighDateTime)<<32 | int64(created.LowDateTime), true
}
