# Packaging and distribution guide (CRM Dialer extension)

This guide explains how to package and distribute the extension for customer installs.

## 1) Local build artifact (zip for manual distribution)

From `client/browser-extension`:

```bash
powershell -Command "Compress-Archive -Path crm-dialer\\* -DestinationPath crm-dialer-v0.1.0.zip -Force"
```

Share the zip plus install instructions.

## 2) Manual install (customer/internal pilot)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the extracted `crm-dialer` folder

## 3) Recommended customer config handoff

Provide these values:

- `API Base URL` (production HTTPS URL)
- `API Key`
- `Provider` (`twilio` or your configured default)
- `Allowed host suffixes` (customer CRM domains)
- `Allow unknown CRM hosts` (keep OFF in production)

## 4) Enterprise distribution options

- Chrome Enterprise policy install (recommended for large teams)
- Signed CRX via internal IT tooling

## 5) Chrome Web Store path (optional)

Before store submission:

- Narrow `host_permissions` as much as possible.
- Add privacy policy and support URL.
- Document what data is processed (phone, contact metadata).
- Increase extension version on each release in `manifest.json`.

## 6) Release process (per version)

1. Update `manifest.json` version.
2. Smoke test:
   - adapter inspector
   - click-to-call
   - call history entry
3. Package zip/CRX.
4. Publish + notify customers.
5. Keep rollback package for previous stable version.
