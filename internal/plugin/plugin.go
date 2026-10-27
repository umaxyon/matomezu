// Package plugin は、開発者プロジェクトのフォルダを追加プラグインとして読む: TypeScript を、ホストのエンジンで動かす JS と、画面で読む JS（と CSS）に変換する。
//
// フォルダには matomezu.json（Manifest）を置き、入口を 2 つ指す: engine（React なし。プラグインを default で出す）と ui（見た目を結んだプラグインを default で出す）。
// 追加プラグインが借りる名前（plugin-modules の表の名前。matomezu・react など）は取り込まず、
// 動いている matomezu が globalThis.__matomezuModules に置いた実物から取り出す形にする。表に無い名前の import は error。
// 変換は Go に組み込んだ esbuild で行うので、利用者が esbuild を別に入れる必要は無い。
package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

// ManifestFile は、フォルダに置くプラグインの説明のファイルの名前
const ManifestFile = "matomezu.json"

// Manifest は、コードを動かす前に読むプラグインの説明
type Manifest struct {
	ID        string `json:"id"`                  // プラグインの id（engine の default の id と同じ）
	Engine    string `json:"engine"`              // ホストのエンジンで動かす入口（フォルダからのパス）
	UI        string `json:"ui"`                  // 画面で読む入口（フォルダからのパス）
	PluginAPI string `json:"pluginApi,omitempty"` // 作ったときのプラグイン API の版
}

// Bundle は変換した追加プラグイン 1 つ
type Bundle struct {
	Dir      string // 読んだフォルダ
	Manifest Manifest
	Engine   string // ホストのエンジンで動かす JS（CommonJS。index.ts から）
	UI       []byte // 画面で import() する JS（ES モジュール。ui.tsx から）
	CSS      []byte // 画面で読む CSS（無ければ nil）
}

// Modules は借りる名前。Engine はホストのエンジンの表、UI は画面の表の名前
type Modules struct {
	Engine []string `json:"engine"`
	UI     []string `json:"ui"`
}

// Build は dir の追加プラグインを変換する
func Build(dir string, modules Modules) (*Bundle, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	m, err := readManifest(abs)
	if err != nil {
		return nil, err
	}
	b := &Bundle{Dir: abs, Manifest: m}
	engine, err := build(abs, m.Engine, api.FormatCommonJS, modules.Engine)
	if err != nil {
		return nil, err
	}
	b.Engine = string(engine[".js"])
	ui, err := build(abs, m.UI, api.FormatESModule, modules.UI)
	if err != nil {
		return nil, err
	}
	b.UI, b.CSS = ui[".js"], ui[".css"]
	return b, nil
}

// readManifest は dir の matomezu.json を読む。フィールドが足りない・知らないフィールドがある・入口がフォルダの外を指すなら error
func readManifest(dir string) (Manifest, error) {
	var m Manifest
	f, err := os.Open(filepath.Join(dir, ManifestFile))
	if err != nil {
		return m, fmt.Errorf("plugin %s: no %s", dir, ManifestFile)
	}
	defer f.Close()
	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return m, fmt.Errorf("plugin %s: %s: %w", dir, ManifestFile, err)
	}
	for name, v := range map[string]string{"id": m.ID, "engine": m.Engine, "ui": m.UI} {
		if v == "" {
			return m, fmt.Errorf("plugin %s: %s needs %q", dir, ManifestFile, name)
		}
	}
	for _, entry := range []string{m.Engine, m.UI} {
		if filepath.IsAbs(entry) || !filepath.IsLocal(entry) {
			return m, fmt.Errorf("plugin %s: %s: %q is not a path inside the folder", dir, ManifestFile, entry)
		}
	}
	return m, nil
}

// build は入口 1 つを変換し、出したファイルを拡張子ごとに返す
func build(dir, entry string, format api.Format, borrow []string) (map[string][]byte, error) {
	path := filepath.Join(dir, entry)
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("plugin %s: no %s", dir, entry)
	}
	r := api.Build(api.BuildOptions{
		EntryPoints:   []string{path},
		Bundle:        true,
		Format:        format,
		Platform:      api.PlatformNeutral,
		Target:        api.ES2020,
		JSX:           api.JSXAutomatic,
		Outdir:        "out", // 書き出さない（Write が false）。CSS を別のファイルに分けるのに要る
		Write:         false,
		LogLevel:      api.LogLevelSilent,
		Plugins:       []api.Plugin{borrowing(borrow)},
		AbsWorkingDir: dir,
	})
	if len(r.Errors) > 0 {
		msgs := api.FormatMessages(r.Errors, api.FormatMessagesOptions{Kind: api.ErrorMessage})
		return nil, fmt.Errorf("plugin %s: %s", dir, strings.TrimSpace(strings.Join(msgs, "")))
	}
	out := map[string][]byte{}
	for _, f := range r.OutputFiles {
		out[filepath.Ext(f.Path)] = f.Contents
	}
	return out, nil
}

// borrowing は、借りる名前の import を globalThis.__matomezuModules から取り出す形にし、ほかのパッケージの import を error にする
func borrowing(names []string) api.Plugin {
	known := map[string]bool{}
	for _, n := range names {
		known[n] = true
	}
	return api.Plugin{
		Name: "matomezu-modules",
		Setup: func(pb api.PluginBuild) {
			pb.OnResolve(api.OnResolveOptions{Filter: `^[^./]`}, func(a api.OnResolveArgs) (api.OnResolveResult, error) {
				if filepath.IsAbs(a.Path) {
					return api.OnResolveResult{}, nil
				}
				if !known[a.Path] {
					return api.OnResolveResult{}, errors.New(unknownImport(a.Path, names))
				}
				return api.OnResolveResult{Path: a.Path, Namespace: "matomezu-modules"}, nil
			})
			pb.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: "matomezu-modules"}, func(a api.OnLoadArgs) (api.OnLoadResult, error) {
				name, _ := json.Marshal(a.Path)
				js := fmt.Sprintf("module.exports = globalThis.__matomezuModules[%s]", name)
				return api.OnLoadResult{Contents: &js, Loader: api.LoaderJS}, nil
			})
		},
	}
}

// unknownImport は、借りられない名前を読んだときの文。zod は matomezu から読む
func unknownImport(path string, names []string) string {
	if path == "zod" || strings.HasPrefix(path, "zod/") {
		return `import zod from "matomezu" (import { z } from "matomezu"), not from "zod"`
	}
	return fmt.Sprintf("%q cannot be imported here: a plugin imports only %s and its own files", path, strings.Join(names, ", "))
}
