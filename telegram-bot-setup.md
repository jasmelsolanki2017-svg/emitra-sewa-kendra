# Telegram Bot Firebase Setup

The Telegram webhook server saves job posts in Firebase Realtime Database path:

```text
LatestJobs
```

## Required `.env`

Create `.env` in this folder:

```text
BOT_TOKEN=your_telegram_bot_token
FIREBASE_URL=https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app
JOBS_PATH=LatestJobs
PORT=3000
FIREBASE_SERVICE_ACCOUNT_BASE64=your_base64_service_account_json
```

`FIREBASE_SERVICE_ACCOUNT_BASE64` is recommended because the bot writes from a server. Without it, Firebase Realtime Database rules may reject the bot write with a permission error.

## Create Service Account Value

1. Open Firebase Console.
2. Go to Project Settings > Service accounts.
3. Generate new private key.
4. Convert the downloaded JSON to base64.

PowerShell:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\service-account.json -Raw)))
```

Paste the output into `FIREBASE_SERVICE_ACCOUNT_BASE64`.

## Run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000/
```

It should show:

```json
{
  "ok": true,
  "firebasePath": "LatestJobs",
  "adminSdkConfigured": true
}
```

## Telegram Webhook

The bot server must be on a public HTTPS URL. Localhost will not receive Telegram messages directly.

Set webhook:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/
```

Check webhook status:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

## Message Format

Send a Telegram post like:

```text
Title: Rajasthan Patwari Recruitment 2026
Type: Online Form
Start Date: 14 May 2026
Last Date: 30 June 2026
Qualification: 12th Pass
Location: Rajasthan
Apply Link: https://example.com/apply
Official Link: https://example.com/notice
```

The website reads these records from `LatestJobs`.
