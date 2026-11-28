package main

import (
	"errors"
	"testing"
)

// WSLプロキシを立てる物は、WSL のネットワークが NAT のときだけ渡す（ミラーモード・読めないとき・WSL でないときは渡さない）
func TestWSLProxyIsOnlyForNATWSL(t *testing.T) {
	old := commandOutput
	t.Cleanup(func() { commandOutput = old })
	for _, c := range []struct {
		name string
		wsl  bool
		mode string
		err  error
		want bool
	}{
		{"nat", true, "nat\n", nil, true},
		{"mirrored", true, "mirrored\n", nil, false},
		{"unreadable", true, "", errors.New("no wslinfo"), false},
		{"not WSL", false, "nat\n", nil, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			commandOutput = func(dir, name string, args ...string) ([]byte, error) {
				if name != "wslinfo" {
					t.Fatalf("ran %s", name)
				}
				return []byte(c.mode), c.err
			}
			if got := wslProxyFor(c.wsl) != nil; got != c.want {
				t.Fatalf("wslProxyFor = %v, want %v", got, c.want)
			}
		})
	}
}
