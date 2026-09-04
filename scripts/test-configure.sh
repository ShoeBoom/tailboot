#!/bin/sh

# Run only inside the disposable build chroot, after the ISO has been built:
# sudo chroot image/chroot /bin/sh < scripts/test-configure.sh
set -eu

config=/run/live/medium/TAILBOOT.JSON
key=/run/tailboot/auth.key
profile=/run/NetworkManager/system-connections/tailboot-wifi.nmconnection
trap 'rm -f "${config}" "${key}" "${profile}"' EXIT HUP INT TERM
mkdir -p /run/live/medium /run/tailboot

printf '%s\n' '{"authKey":"tskey-auth-test"}' > "${config}"
/usr/local/sbin/tailboot-configure
test "$(cat "${key}")" = tskey-auth-test
test "$(stat -c %a "${key}")" = 600
test ! -e "${profile}"

cat > "${config}" <<'JSON'
{"authKey":"tskey-auth-test","wifi":{"ssid":"Café \"网络\"","password":"quotes\"and\\backslash"}}
JSON
/usr/local/sbin/tailboot-configure
test "$(stat -c %a "${profile}")" = 600
# nmcli serializes Unicode SSIDs as their UTF-8 bytes and escapes backslashes.
grep -Fxq 'ssid=67;97;102;195;169;32;34;231;189;145;231;187;156;34;' "${profile}"
grep -Fxq 'psk=quotes"and\\backslash' "${profile}"
grep -Fxq 'key-mgmt=wpa-psk' "${profile}"
test "$(grep -c '^method=auto$' "${profile}")" = 2
# Re-import through NetworkManager's parser to check the complete profile.
nmcli --offline connection modify connection.id tailboot-wifi < "${profile}" > /dev/null
/usr/local/sbin/tailboot-configure
test "$(find /run/NetworkManager/system-connections -name 'tailboot-wifi*' | wc -l)" -eq 1

printf '%s\n' 'invalid JSON' > "${config}"
if /usr/local/sbin/tailboot-configure 2>/dev/null; then
  echo 'Invalid JSON unexpectedly succeeded.' >&2
  exit 1
fi

echo 'Verified auth-key extraction, optional Wi-Fi, credential escaping, and profile permissions.'
