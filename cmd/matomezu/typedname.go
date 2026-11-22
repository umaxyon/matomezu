package main

// 利用者に「端末で打って」と見せるコマンドの名前。Windows で npm が置く起動ファイルは name.ps1 と name.cmd があり、
// PowerShell は .ps1 を選んで既定の実行ポリシーで止まる。.cmd はどの端末でも動くので、そこでは name.cmd と見せる（Volta などの .exe はそのまま）

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// typedName は、プログラム name を利用者が端末で打つときの名前
func typedName(name string) string {
	return typedNameOn(runtime.GOOS, exec.LookPath, name)
}

func typedNameOn(goos string, lookPath func(string) (string, error), name string) string {
	if goos != "windows" {
		return name
	}
	p, err := lookPath(name)
	if err != nil {
		return name
	}
	switch ext := strings.ToLower(filepath.Ext(p)); ext {
	case ".cmd", ".bat":
		return name + ext
	}
	return name
}
