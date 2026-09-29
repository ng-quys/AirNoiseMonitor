#ifndef AIRNOISEMONITOR_SECRETS_H
#define AIRNOISEMONITOR_SECRETS_H

// Copy this file to include/secrets.h, then replace the placeholder values.
// Never commit include/secrets.h to a public repository.

#define WIFI_DEFAULT_SSID       "YOUR_WIFI_SSID"
#define WIFI_DEFAULT_PASSWORD   "YOUR_WIFI_PASSWORD"

// Optional Firebase auth token/secret. Leave empty only when your
// Firebase Realtime Database rules intentionally allow unauthenticated access.
#define FIREBASE_AUTH           "YOUR_FIREBASE_AUTH"

// Use a strong password on real hardware when OTA is enabled.
#define OTA_PASSWORD            "YOUR_OTA_PASSWORD"

// Telegram bot credentials.
#define TELEGRAM_BOT_TOKEN      "YOUR_TELEGRAM_BOT_TOKEN"
#define TELEGRAM_CHAT_ID        "YOUR_TELEGRAM_CHAT_ID"

#endif // AIRNOISEMONITOR_SECRETS_H
