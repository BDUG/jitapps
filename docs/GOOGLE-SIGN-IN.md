# Google account sign-in

The suite supports the official [Google Identity Services sign-in button and One Tap](https://developers.google.com/identity/gsi/web/guides/offerings). Choose **More options → Browser** under **Google account** on the desktop, or in the Google Drive dialog from any app. The actual sign-in button is rendered by Google's SDK, preserving Google's branding and account chooser behavior.

A separate **Device code** method is also available for eligible TVs and limited-input deployments; see below. Sign-in is optional. It displays a verified Google account in the current page. It does **not** protect the local suite, establish a server authorization session, synchronize local projects, verify workshop display names, or grant permission to Drive. The local editors keep working when signed out.

## Configure

1. In Google Cloud, configure the OAuth consent screen and create a **Web application** OAuth client. Register the suite's exact **Authorized JavaScript origin**, including its port, such as `http://localhost:8000`. Use HTTPS for deployed sites. Add test users if the consent screen is in testing mode.
2. Put the public client ID in `shared-suite/google-drive-config.json`:

   ```json
   { "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com" }
   ```

   This deployment setting is preferred and checked by the server. For local installations without a preset, enter the public ID under **Google account → Google sign-in setup**. It shares the existing Drive public-client configuration. No API key or client secret is needed for sign-in. Google still requires the OAuth client ID.
3. Install the optional official server verifier in the Python environment used to run the suite:

   ```sh
   python3 -m pip install -r server/requirements-google.txt
   python3 server/server.py
   ```

   Restart an already running server. Without the optional package, sign-in gives a setup message; Drive-only OAuth and the other tools remain available. A plain static server cannot verify ID tokens. Install the package before freezing a Tauri sidecar if the packaged server should support sign-in.
4. Open **Google account**, then use **Sign in with Google**. The server verifies the ID-token signature, audience, issuer, lifetime and flow nonce using Google's `google-auth` library. The SDK uses a popup account flow with an optional FedCM One Tap prompt. **Try One Tap** is user initiated; automatic sign-in is disabled. If One Tap is suppressed, use the regular Google button.

The web identity APIs may be unavailable in embedded WebViews or restricted browsers. Use the browser deployment for Google sign-in in that case. A native system-browser OAuth/PKCE integration is not part of this flow.

## Drive remains a separate consent

Choose **Connect Google Drive** to authorize file operations using the existing GIS OAuth token client. Sign-in alone never requests Drive scopes. Drive and Docs APIs must be enabled separately when using those features. See [Drive setup](../shared-suite/GOOGLE-DRIVE.md) and [colabriX collaboration](../colabriX/README.md).

**Sign out of this app** clears the page's account state and disables Google's automatic account selection. It does not sign you out of Google globally or revoke a separately granted Drive token. Use **Disconnect** in the Drive dialog to manage that connection. Reloading the page clears the app account state; sign in again using Google's account chooser or One Tap.

## Data and verification

ID credentials are sent by same-origin POST to `/api/google/verify`; they are never stored in localStorage, sessionStorage or app files, and are never sent to the AI relay. The endpoint returns only a small verified profile and expiry, with `Cache-Control: no-store`. The account profile is kept in page memory and cleared on expiry, sign-out or reload. Closing the dialog discards unfinished verification results.

The server fetches Google's public signing certificates over HTTPS and caches them for five minutes. No credential is sent to the certificate endpoint. Server deployments need network access and a valid CA trust chain; `requests` supports `REQUESTS_CA_BUNDLE` for a local CA bundle. This account-display endpoint is not an access-control boundary. Keep the suite's existing localhost and coding-runtime protections in place.

## Troubleshooting

- **Button unavailable / origin error:** check the exact origin and OAuth client ID, consent-screen configuration, JavaScript/content blockers and browser popup policy.
- **One Tap absent:** browsers, user privacy settings, FedCM policy and Google cooldown periods can suppress it. Use the regular sign-in button.
- **Verifier not installed:** install `server/requirements-google.txt` using the server's Python interpreter, then restart.
- **Invalid or expired credential:** retry sign-in. The app does not accept unverified JWT payloads as an account confirmation.
- **Drive not connected:** sign-in and Drive authorization are separate; approve the Drive popup and required scopes.

## Checks

```sh
python3 -m unittest server.google_identity_test
node shared-suite/google-identity-browser-test.cjs
```

Signed-credential tests use generated RSA keys and mocked public certificates; install the optional verifier and `cryptography` to run them. HTTP checks exercise same-origin restrictions, content type and missing verifier handling. Browser tests mock Google SDK/Drive endpoints and the verification response, and cover sign-in, One Tap, sign-out/re-sign-in, failures, canceled verification, token non-persistence and separate Drive consent. No live Google account is used.

## Device-code setup for limited-input deployments

The [Google device authorization guide](https://developers.google.com/identity/protocols/oauth2/limited-input-device#creatingcred) describes a different OAuth client type: **TVs and Limited Input devices**. Google reserves this method for eligible limited-input devices; ordinary desktop/browser apps should use the Browser method above. This is not a way to bypass Google client registration or provider eligibility.

1. Configure your Google Cloud project and consent screen, and create a **TVs and Limited Input devices** OAuth client. Copy its client ID and matching client secret. A Web application client cannot substitute for this client type.
2. Open **Google account → Device sign-in setup** on the server's localhost origin. Enter the device client ID and secret, then choose **Save setup**. An empty secret field retains the saved secret when the client ID is unchanged.
3. Choose **Get sign-in code**. On a separate browser-capable device, open the displayed Google verification URL, enter the user code and approve sign-in. The suite polls at Google's interval and waits for the verified account result.
4. Use **Cancel** to stop; closing the account dialog or changing methods also cancels the pending session. Request a fresh code after denial or expiry. Browser sign-in remains selectable under **More options**. The configured login view shows one primary action; after requesting a code, it shows the code, **Copy code**, the Google verification link and Cancel. Device setup collapses once configured.

Device credentials are stored privately in `google-device.json` beside the server's provider configuration, or at `--google-device-config PATH`. The file is created with mode 0600, is blocked from static HTTP downloads, and is never included in public site configuration. The management endpoint is restricted to the same localhost origin. Never put this secret in `shared-suite/google-drive-config.json`; that file is public and belongs to the Browser/Drive client.

The server uses fixed Google HTTPS endpoints for device-code acquisition, token polling and authenticated OpenID user-info retrieval. Device codes and tokens are kept out of the UI; refresh tokens are discarded. Poll intervals, `authorization_pending`, `slow_down`, denial and expiry are handled explicitly. Transient token-endpoint errors can be retried until expiry. Pending sessions exist only in server memory and are cleared on restart or configuration changes. Completed profile state remains page-local, just like the Browser method. The device method does not load GIS JavaScript or require `requirements-google.txt`.

This sign-in method requests only **openid, email and profile**. It does not connect Drive. Google device authorization supports only specific API scopes, including `drive.file` and `drive.appdata`; the full `drive` scope used to browse all existing Drive content is unavailable in this flow. Continue using the separate Browser/Drive Web client for the suite's existing Drive integration.

Device checks:

```sh
python3 -m unittest server.google_device_test
node shared-suite/google-device-browser-test.cjs
```

Tests mock Google device/token/user-info endpoints; no live Google account or device client was used.
