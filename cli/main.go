package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Set together from the verified ISO build using go build -ldflags.
var releaseTag, isoName, isoSHA256, configOffset string

const configCapacity = 4095

var placeholder = []byte("TAILBOOT_CONFIG_V1" + string(bytes.Repeat([]byte{'~'}, configCapacity-len("TAILBOOT_CONFIG_V1"))) + "\n")

type wifiConfig struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
}
type configuration struct {
	AuthKey string      `json:"authKey"`
	Wifi    *wifiConfig `json:"wifi,omitempty"`
}

func configRecord(config configuration) ([]byte, error) {
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(config); err != nil {
		return nil, errors.New("could not encode configuration")
	}
	// JSON.stringify leaves these Unicode separators literal. Preserve escaped backslashes.
	data := []byte(strings.NewReplacer(`\\`, `\\`, `\u2028`, "\u2028", `\u2029`, "\u2029").Replace(strings.TrimSuffix(encoded.String(), "\n")))
	if len(data) > configCapacity {
		return nil, fmt.Errorf("configuration exceeds the %d-byte ISO slot", configCapacity)
	}
	record := bytes.Repeat([]byte{' '}, configCapacity+1)
	copy(record, data)
	record[configCapacity] = '\n'
	return record, nil
}

// Verify the complete base image before changing any bytes.
func patchISO(iso, record []byte, offset int64, checksum string) error {
	digest := sha256.Sum256(iso)
	if hex.EncodeToString(digest[:]) != checksum {
		return errors.New("base ISO SHA-256 does not match this CLI release")
	}
	if offset < 0 || offset > int64(len(iso))-int64(len(placeholder)) {
		return errors.New("ISO ended before the complete configuration slot")
	}
	slot := iso[offset : offset+int64(len(placeholder))]
	if !bytes.Equal(slot, placeholder) {
		return errors.New("ISO configuration slot does not match the release offset")
	}
	copy(slot, record)
	return nil
}

func downloadISO(client *http.Client, url string) ([]byte, error) {
	response, err := client.Get(url)
	if err != nil {
		return nil, errors.New("ISO download failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ISO download failed with HTTP %d", response.StatusCode)
	}
	iso, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, errors.New("ISO download interrupted")
	}
	return iso, nil
}

// Only create the destination after download, verification, and customization.
// Refuse to overwrite existing files and remove partial output on write failure.
func saveISO(path string, iso []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return errors.New("could not create output ISO (the destination must not already exist)")
	}
	_, writeErr := file.Write(iso)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		os.Remove(path)
		return errors.New("could not write output ISO")
	}
	return nil
}

func run(args []string, output io.Writer) error {
	flags := flag.NewFlagSet("tailboot", flag.ContinueOnError)
	// Flag parsing errors may contain supplied values. Never print them.
	flags.SetOutput(io.Discard)
	authKey := flags.String("auth-key", os.Getenv("TAILBOOT_AUTH_KEY"), "Tailscale auth key (or TAILBOOT_AUTH_KEY)")
	ssid := flags.String("wifi-ssid", os.Getenv("TAILBOOT_WIFI_SSID"), "Wi-Fi SSID (or TAILBOOT_WIFI_SSID)")
	password := flags.String("wifi-password", os.Getenv("TAILBOOT_WIFI_PASSWORD"), "Wi-Fi password (or TAILBOOT_WIFI_PASSWORD)")
	destination := flags.String("output", "tailboot-custom.iso", "new output ISO path")
	version := flags.Bool("version", false, "show embedded release metadata")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(output, "Usage: tailboot [--auth-key KEY] [--wifi-ssid SSID --wifi-password PASSWORD] [--output PATH]")
			fmt.Fprintln(output, "Credentials may also be supplied via TAILBOOT_AUTH_KEY, TAILBOOT_WIFI_SSID, and TAILBOOT_WIFI_PASSWORD.\nUse --version to show embedded release metadata.")
			return nil
		}
		return errors.New("invalid arguments; use --help")
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments; use --help")
	}
	offset, err := strconv.ParseInt(configOffset, 10, 64)
	checksum, hashErr := hex.DecodeString(isoSHA256)
	if err != nil || offset < 0 || hashErr != nil || len(checksum) != sha256.Size || releaseTag == "" || isoName == "" {
		return errors.New("this CLI has no valid embedded release metadata")
	}
	if *version {
		fmt.Fprintf(output, "%s\nISO: %s\nSHA-256: %s\nConfiguration offset: %d\n", releaseTag, isoName, isoSHA256, offset)
		return nil
	}
	if *authKey == "" {
		return errors.New("an auth key is required")
	}
	config := configuration{AuthKey: *authKey}
	if *ssid != "" {
		if *password == "" {
			return errors.New("a Wi-Fi password is required when an SSID is supplied")
		}
		config.Wifi = &wifiConfig{SSID: *ssid, Password: *password}
	}
	record, err := configRecord(config)
	if err != nil {
		return err
	}
	url := "https://github.com/ShoeBoom/tailboot/releases/download/" + releaseTag + "/" + isoName
	iso, err := downloadISO(&http.Client{Timeout: 30 * time.Minute}, url)
	if err != nil {
		return err
	}
	if err := patchISO(iso, record, offset, isoSHA256); err != nil {
		return err
	}
	if err := saveISO(*destination, iso); err != nil {
		return err
	}
	fmt.Fprintln(output, "ISO ready. Flash it to a USB drive.")
	return nil
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
