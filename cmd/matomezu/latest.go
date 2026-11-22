package main

// 新しい版を聞く: npm のレジストリに matomezu の一番新しい版（dist-tags.latest）を HTTP で聞く。npm は起動しない。
// レジストリは npm の設定の順に決める: 環境変数 npm_config_registry（大文字でも）→ 利用者の .npmrc（NPM_CONFIG_USERCONFIG か ~/.npmrc）の registry= → https://registry.npmjs.org/

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultRegistry = "https://registry.npmjs.org/"

// updateCheckEvery は、常駐が自分で新しい版を確かめる間
const updateCheckEvery = 24 * time.Hour

// latestTimeout は、レジストリに聞くのを待つ長さ
const latestTimeout = 10 * time.Second

// registryURL は、npm の設定の順に決めたレジストリ（末尾は /）。getenv は環境変数、home はホームのフォルダ
func registryURL(getenv func(string) string, home string) string {
	for _, name := range []string{"npm_config_registry", "NPM_CONFIG_REGISTRY"} {
		if v := strings.TrimSpace(getenv(name)); v != "" {
			return withSlash(v)
		}
	}
	rc := getenv("npm_config_userconfig")
	if rc == "" {
		rc = getenv("NPM_CONFIG_USERCONFIG")
	}
	if rc == "" && home != "" {
		rc = filepath.Join(home, ".npmrc")
	}
	if v := npmrcRegistry(rc); v != "" {
		return withSlash(v)
	}
	return defaultRegistry
}

// npmrcRegistry は、npm の設定のファイル path の registry= の値（無ければ空）
func npmrcRegistry(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	found := ""
	lines := bufio.NewScanner(f)
	for lines.Scan() {
		line := strings.TrimSpace(lines.Text())
		if strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if ok && strings.TrimSpace(key) == "registry" {
			found = strings.Trim(strings.TrimSpace(value), `"'`)
		}
	}
	return found
}

func withSlash(u string) string {
	if strings.HasSuffix(u, "/") {
		return u
	}
	return u + "/"
}

// latestVersion は、レジストリ registry の matomezu の一番新しい版
func latestVersion(ctx context.Context, client *http.Client, registry string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, latestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, registry+"matomezu", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.npm.install-v1+json")
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s answered %s", registry, res.Status)
	}
	var body struct {
		DistTags struct {
			Latest string `json:"latest"`
		} `json:"dist-tags"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.DistTags.Latest == "" {
		return "", fmt.Errorf("%s has no latest version of matomezu", registry)
	}
	return body.DistTags.Latest, nil
}

// latestFor は、今の版 current と比べる、新しい版を聞く口（聞くたびにレジストリを決め直す。利用者が .npmrc を直したら次から効く）
func latestFor(current string) func(context.Context) (string, bool, error) {
	return func(ctx context.Context) (string, bool, error) {
		home, _ := os.UserHomeDir()
		v, err := latestVersion(ctx, http.DefaultClient, registryURL(os.Getenv, home))
		if err != nil {
			return "", false, err
		}
		return v, versionLess(current, v), nil
	}
}
