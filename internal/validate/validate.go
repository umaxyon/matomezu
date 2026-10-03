// Package validate は図のデータの誤りを調べる。検査の決まりは画面と同じもの（web/src/validate.ts）を使う:
// ビルドした web/dist/validate.js（web/src/validate-cli.ts が入口）を実行ファイルに埋め込み、Go の JavaScript エンジン（goja）で動かす。
// 決まりを Go に書き写さないので、画面と CLI で検査がずれない。
package validate

import (
	"fmt"
	"sync"

	"github.com/dop251/goja"
	"github.com/umaxyon/matomezu/web"
)

var (
	once    sync.Once
	program *goja.Program
	loadErr error
)

func load() {
	src, err := web.FS.ReadFile("dist/validate.js")
	if err != nil {
		loadErr = fmt.Errorf("validate.js is not embedded (run bun run build): %w", err)
		return
	}
	program, loadErr = goja.Compile("validate.js", string(src), true)
}

// Problems は、図の JSON（ファイルの中身）の誤りを全部返す。無ければ空
func Problems(json []byte) ([]string, error) {
	once.Do(load)
	if loadErr != nil {
		return nil, loadErr
	}
	vm := goja.New()
	if _, err := vm.RunProgram(program); err != nil {
		return nil, err
	}
	diagnose, ok := goja.AssertFunction(vm.Get("matomezuDiagnose"))
	if !ok {
		return nil, fmt.Errorf("validate.js does not define matomezuDiagnose")
	}
	res, err := diagnose(goja.Undefined(), vm.ToValue(string(json)))
	if err != nil {
		return nil, err
	}
	var out []string
	if err := vm.ExportTo(res, &out); err != nil {
		return nil, err
	}
	return out, nil
}
