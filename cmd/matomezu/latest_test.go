package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRegistryURLFollowsNpmConfig(t *testing.T) {
	home := t.TempDir()
	other := filepath.Join(t.TempDir(), "npmrc")
	if err := os.WriteFile(filepath.Join(home, ".npmrc"), []byte("# a comment\nregistry=http://home.example/\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(other, []byte("registry = \"http://other.example\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name string
		env  map[string]string
		home string
		want string
	}{
		{"env", map[string]string{"npm_config_registry": "http://env.example"}, home, "http://env.example/"},
		{"upper env", map[string]string{"NPM_CONFIG_REGISTRY": "http://up.example/"}, home, "http://up.example/"},
		{"userconfig", map[string]string{"npm_config_userconfig": other}, home, "http://other.example/"},
		{"home npmrc", nil, home, "http://home.example/"},
		{"default", nil, t.TempDir(), defaultRegistry},
	} {
		got := registryURL(func(k string) string { return c.env[k] }, c.home)
		if got != c.want {
			t.Errorf("%s: registryURL = %q; want %q", c.name, got, c.want)
		}
	}
}

func TestLatestVersionReadsTheLatestTag(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/matomezu" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"name":"matomezu","dist-tags":{"latest":"1.2.3"}}`))
	}))
	defer srv.Close()
	v, err := latestVersion(context.Background(), srv.Client(), srv.URL+"/")
	if err != nil || v != "1.2.3" {
		t.Fatalf("latestVersion = %q, %v", v, err)
	}
	if _, err := latestVersion(context.Background(), srv.Client(), srv.URL+"/nothing/"); err == nil {
		t.Fatal("a missing package gave a version")
	}
}
