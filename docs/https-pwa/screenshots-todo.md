# Screenshots to capture manually

Every entry below is a placeholder reference used in the step docs. Create the folder `docs/img/` and add the real PNG with the exact filename.

| Placeholder | Where referenced | Capture when |
| --- | --- | --- |
| `docs/img/00-current-http-lock.png` | 00-overview | Phase A: browser showing HTTP (no padlock) on `:8081`. |
| `docs/img/03-certificate-padlock.png` | 04-nginx-tls | Phase B: Chrome padlock on `https://app.smartcare.local`. |
| `docs/img/03-install-prompt.png` | 10-registration-install-ux | Phase C: Android Chrome install prompt. |
| `docs/img/07-curl-login-csrf.png` | 07-https-verification | Phase B: terminal with `Set-Cookie` and CSRF 403/204 results. |
| `docs/img/12-lighthouse-pwa.png` | 12-pwa-verification | Phase C: Lighthouse PWA score for both hosts. |
| `docs/img/12-offline-page.png` | 12-pwa-verification | Phase C: installed app in airplane mode showing `offline.html`. |
| `docs/img/13-phone-ca-trust.png` | 13-phone-access | Phase D: Android/iOS CA trust screen. |
| `docs/img/13-dnsmasq-phone-wifi.png` | 13-phone-access | Phase D: phone Wi-Fi DNS set to PC IP. |

<!-- TODO screenshot: capture each item above on a physical phone and commit to docs/img/ (never include real patient data or tokens). -->
