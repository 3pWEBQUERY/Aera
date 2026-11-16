# Private ClamAV scanner for Aera's upload pipeline (lib/malware-scan.ts).
#
# Railway service "ClamAV": build from this Dockerfile, no public domain.
# The web service reaches it as CLAMAV_HOST=${{ClamAV.RAILWAY_PRIVATE_DOMAIN}},
# CLAMAV_PORT=3310. Videos may be up to 512 MB (lib/upload-policy.ts), so the
# INSTREAM limit must be larger than that; the default of the image is 100M.
FROM clamav/clamav-debian:1.5

# Replace whatever the image ships for these keys instead of appending
# duplicates, then bind clamd on every interface (Railway's private network
# is reached over IPv6 and IPv4).
RUN set -eu; \
    conf=/etc/clamav/clamd.conf; \
    sed -i -E '/^#?[[:space:]]*(StreamMaxLength|MaxFileSize|MaxScanSize|TCPSocket|TCPAddr)([[:space:]]|$)/d' "$conf"; \
    printf '%s\n' \
      'TCPSocket 3310' \
      'StreamMaxLength 600M' \
      'MaxFileSize 600M' \
      'MaxScanSize 1200M' >> "$conf"; \
    grep -E '^(TCPSocket|StreamMaxLength|MaxFileSize|MaxScanSize)' "$conf"

EXPOSE 3310
