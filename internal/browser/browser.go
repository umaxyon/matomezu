// Package browser は URL を既定のブラウザで開く。開けない環境では理由を返す。
package browser

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Open は url をブラウザで開く。開けたかどうかは起動したコマンドの終了コードで判断する
func Open(url string) error {
	for _, c := range commands(url) {
		if _, err := exec.LookPath(c[0]); err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err := exec.CommandContext(ctx, c[0], c[1:]...).Run()
		cancel()
		if err == nil {
			return nil
		}
	}
	return errors.New(reason())
}

func commands(url string) [][]string {
	switch runtime.GOOS {
	case "darwin":
		return [][]string{{"open", url}}
	case "windows":
		return [][]string{{"rundll32", "url.dll,FileProtocolHandler", url}}
	}
	var cs [][]string
	if isWSL() {
		// Windows 側のブラウザで開く。WSL の localhost は Windows から届く
		cs = append(cs,
			[]string{"wslview", url},
			[]string{"rundll32.exe", "url.dll,FileProtocolHandler", url},
		)
	}
	if hasDisplay() {
		cs = append(cs, []string{"xdg-open", url})
	}
	return cs
}

func reason() string {
	switch {
	case isWSL():
		return "could not start a Windows browser from WSL (Windows interop may be unavailable)"
	case os.Getenv("SSH_CONNECTION") != "":
		return "running over SSH; the browser is on another machine"
	case runtime.GOOS == "linux" && !hasDisplay():
		return "no display found"
	}
	return "no browser launcher found"
}

func hasDisplay() bool {
	return os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != ""
}

func isWSL() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	if os.Getenv("WSL_DISTRO_NAME") != "" {
		return true
	}
	b, _ := os.ReadFile("/proc/version")
	return strings.Contains(strings.ToLower(string(b)), "microsoft")
}
