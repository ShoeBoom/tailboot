package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

func TestBrowserParity(t *testing.T) {
	source, err := os.ReadFile("../image/config/includes.binary/TAILBOOT.JSON")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, placeholder) {
		t.Fatal("placeholder differs from ISO")
	}
	for _, config := range []configuration{
		{AuthKey: "test"},
		{AuthKey: "test", Wifi: &wifiConfig{SSID: "Café \"网络\" \\ 📶 <>&\u2028\u2029 \\u2028", Password: " spaces \" \\ $() `secret` "}},
		{AuthKey: strings.Repeat("x", configCapacity-len(`{"authKey":""}`))},
	} {
		input, _ := json.Marshal(config)
		command := exec.Command("node", "--input-type=module", "-e", `
import { CONFIG_PLACEHOLDER, patchTailbootIso } from '../tailboot-iso.ts';
let input = ''; for await (const chunk of process.stdin) input += chunk;
await patchTailbootIso({source: new Blob([CONFIG_PLACEHOLDER]), config: JSON.parse(input), configOffset: 0, destination: new WritableStream({write(chunk) {process.stdout.write(chunk)}})});
`)
		command.Stdin = bytes.NewReader(input)
		expected, err := command.Output()
		if err != nil {
			t.Fatal(err)
		}
		record, err := configRecord(config)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(record, expected) {
			t.Fatal("record differs from TypeScript implementation")
		}
	}
	for _, key := range []string{strings.Repeat("x", configCapacity), strings.Repeat("é", configCapacity/2)} {
		if _, err := configRecord(configuration{AuthKey: key}); err == nil {
			t.Fatal("accepted oversized config")
		}
	}
}

func TestPatch(t *testing.T) {
	record, _ := configRecord(configuration{AuthKey: "test"})
	original := append([]byte("header"), placeholder...)
	original = append(original, []byte("footer")...)
	for _, tc := range []struct {
		name     string
		offset   int64
		checksum string
		input    []byte
		valid    bool
	}{
		{"valid", 6, digest(original), original, true},
		{"checksum", 6, strings.Repeat("0", 64), original, false},
		{"stale offset", 5, digest(original), original, false},
		{"negative", -1, digest(original), original, false},
		{"overflow", 1<<63 - 1, digest(original), original, false},
		{"truncated", 6, digest(original[:100]), original[:100], false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := bytes.Clone(tc.input)
			err := patchISO(data, record, tc.offset, tc.checksum)
			if (err == nil) != tc.valid {
				t.Fatalf("unexpected result: %v", err)
			}
			if !tc.valid && !bytes.Equal(data, tc.input) {
				t.Fatal("failed verification modified ISO")
			}
			if tc.valid && (!bytes.Equal(data[:6], original[:6]) || !bytes.Equal(data[6+len(record):], original[6+len(record):]) || !bytes.Equal(data[6:6+len(record)], record)) {
				t.Fatal("incorrect patch")
			}
		})
	}
}

func TestDownload(t *testing.T) {
	for _, status := range []int{200, 404} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status); w.Write([]byte("iso")) }))
		data, err := downloadISO(server.Client(), server.URL)
		server.Close()
		if status == 200 && (err != nil || string(data) != "iso") {
			t.Fatal("download failed")
		}
		if status != 200 && err == nil {
			t.Fatal("accepted HTTP failure")
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100")
		w.Write([]byte("short"))
	}))
	defer server.Close()
	if _, err := downloadISO(server.Client(), server.URL); err == nil {
		t.Fatal("accepted interrupted download")
	}
}

func TestSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "output.iso")
	if err := saveISO(path, []byte("verified")); err != nil {
		t.Fatal(err)
	}
	if err := saveISO(path, []byte("overwrite")); err == nil {
		t.Fatal("overwrote existing ISO")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "verified" {
		t.Fatal("changed existing output")
	}
}

func TestArgumentsDoNotLeakCredentials(t *testing.T) {
	for _, args := range [][]string{{"--unknown=secret"}, {"--version=secret"}, {"secret"}} {
		var output bytes.Buffer
		err := run(args, &output)
		if err == nil || strings.Contains(err.Error()+output.String(), "secret") {
			t.Fatal("invalid arguments exposed")
		}
	}
}

// CI supplies the same verified ISO, digest, and offset used to build the CLI.
func TestBuiltISO(t *testing.T) {
	path := os.Getenv("TAILBOOT_TEST_ISO")
	if path == "" {
		t.Skip("no built ISO supplied")
	}
	iso, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	offset, err := strconv.ParseInt(os.Getenv("TAILBOOT_TEST_OFFSET"), 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	config := configuration{AuthKey: "test", Wifi: &wifiConfig{SSID: "Café 网络 📶", Password: " spaces \\ \" "}}
	record, err := configRecord(config)
	if err != nil {
		t.Fatal(err)
	}
	before, after := digest(iso[:offset]), digest(iso[offset+4096:])
	size := len(iso)
	if err := patchISO(iso, record, offset, os.Getenv("TAILBOOT_TEST_SHA256")); err != nil {
		t.Fatal(err)
	}
	if len(iso) != size || digest(iso[:offset]) != before || digest(iso[offset+4096:]) != after {
		t.Fatal("changed surrounding ISO bytes")
	}
	patched := filepath.Join(t.TempDir(), "patched.iso")
	if err := saveISO(patched, iso); err != nil {
		t.Fatal(err)
	}
	extracted := filepath.Join(t.TempDir(), "TAILBOOT.JSON")
	if output, err := exec.Command("xorriso", "-abort_on", "FAILURE", "-osirrox", "on", "-indev", patched, "-extract", "/TAILBOOT.JSON", extracted).CombinedOutput(); err != nil {
		t.Fatalf("extract: %v: %s", err, output)
	}
	data, err := os.ReadFile(extracted)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(data, record) {
		t.Fatal("extracted configuration differs")
	}
}

// Exercise the full CLI without providing a runtime URL or local ISO override.
type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestRun(t *testing.T) {
	oldTag, oldName, oldHash, oldOffset := releaseTag, isoName, isoSHA256, configOffset
	oldTransport := http.DefaultTransport
	defer func() {
		releaseTag, isoName, isoSHA256, configOffset = oldTag, oldName, oldHash, oldOffset
		http.DefaultTransport = oldTransport
	}()
	releaseTag, isoName, isoSHA256, configOffset = "v2026.09.05.000000", "test.iso", digest(placeholder), "0"
	for _, valid := range []bool{true, false} {
		http.DefaultTransport = transportFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://github.com/ShoeBoom/tailboot/releases/download/"+releaseTag+"/test.iso" {
				t.Fatal("incorrect release URL")
			}
			data := placeholder
			if !valid {
				data = []byte("corrupt")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(data))}, nil
		})
		path := filepath.Join(t.TempDir(), "out.iso")
		var output bytes.Buffer
		err := run([]string{"--auth-key", "secret", "--output", path}, &output)
		if (err == nil) != valid {
			t.Fatalf("unexpected result: %v", err)
		}
		if !valid {
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Fatal("failed ISO written")
			}
		}
		if strings.Contains(output.String(), "secret") {
			t.Fatal("credential logged")
		}
	}
}
