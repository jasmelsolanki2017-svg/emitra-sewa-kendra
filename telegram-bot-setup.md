# Telegram Bot Setup

Site ke admin pages se post Telegram par bhejne ke liye naya bot banakar server env me token set karna hoga.

## 1. Naya bot banayein

1. Telegram me `@BotFather` open karein.
2. `/newbot` bhejein.
3. Bot ka name aur username set karein.
4. BotFather jo token de, use `TELEGRAM_BOT_TOKEN` me set karein.

## 2. Channel ya group connect karein

### Channel ke liye

1. Apne Telegram channel me bot ko admin banayein.
2. Env me `TELEGRAM_CHAT_ID=@your_channel_username` set karein.
3. Private channel ho to numeric chat id use karni hogi.

### Group ke liye

1. Bot ko group me add karein.
2. Group me koi message bhejein.
3. Browser me open karein:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

4. Response me `chat.id` copy karke `TELEGRAM_CHAT_ID` me set karein.

## 3. Render/server env variables

Render dashboard me server service ke Environment section me ye values set karein:

```text
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_CHAT_ID=@your_channel_username
```

Private group/channel ke liye `TELEGRAM_CHAT_ID` aksar `-100...` se start hota hai.

## 4. Server redeploy

Env save karne ke baad server redeploy/restart karein. Admin side me `admin-auto-checker.html` par `Check Server` dabane par Telegram status `Ready` aana chahiye.

## 5. Post bhejna

- `premium-admin.html`: saved premium post ke aage `Telegram Post` dabayein.
- `dashboard.html`: Latest Jobs list me `Telegram Post` dabayein.

Bot delete ho gaya ho to sirf naya token env me replace karke server redeploy karna hai. Code change dobara nahi chahiye.
