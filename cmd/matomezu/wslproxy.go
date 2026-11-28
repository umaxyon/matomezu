package main

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"

	"github.com/umaxyon/matomezu/internal/peer"
)

type wslProxyCmd struct{}

func (wslProxyCmd) Run() error {
	return peer.RunWSLProxy(os.Stdin, os.Stdout)
}

// wslProxyDir は、cmd.exe を起こすフォルダ（WSL のフォルダのままだと、cmd.exe が UNC のパスを断って Windows のフォルダへ替えた旨を出す）
const wslProxyDir = "/mnt/c"

// launchWSLProxy は、Windows の matomezu を WSLプロキシとして立てる（NAT の WSL の常駐が、ホストどうしの入口を開いたとき）。
// 標準入力を閉じると終わる（WSL の側が閉じると、cmd.exe と npm などの .cmd の入口を通しても、Windows の matomezu の標準入力まで閉じが届く）。
// Windows に matomezu が無い・古いときは、何か言って終わる（標準出力は最初の行の無いまま閉じる）
func launchWSLProxy() (peer.WSLProxyProcess, error) {
	cmd := exec.Command("cmd.exe", "/c", "matomezu", "wsl-proxy")
	if _, err := os.Stat(wslProxyDir); err == nil {
		cmd.Dir = wslProxyDir
	}
	cmd.Stderr = os.Stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return peer.WSLProxyProcess{}, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return peer.WSLProxyProcess{}, err
	}
	if err := cmd.Start(); err != nil {
		return peer.WSLProxyProcess{}, err
	}
	return peer.WSLProxyProcess{Stdin: stdin, Stdout: &waitAtEOF{r: stdout, cmd: cmd}}, nil
}

// waitAtEOF は、標準出力を読み終えたら、立てたプロセスの終わりを待つ（終わったプロセスを残さない）
type waitAtEOF struct {
	r    io.Reader
	cmd  *exec.Cmd
	once sync.Once
}

func (w *waitAtEOF) Read(b []byte) (int, error) {
	n, err := w.r.Read(b)
	if err != nil {
		w.once.Do(func() { _ = w.cmd.Wait() })
		if !errors.Is(err, io.EOF) {
			err = io.EOF
		}
	}
	return n, err
}
