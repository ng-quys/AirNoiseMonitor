#include "telegram_manager.h"
#include "config.h"

#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

bool TelegramManager::sendMessage(const String &message) {
    if (strlen(TELEGRAM_BOT_TOKEN) == 0 || strlen(TELEGRAM_CHAT_ID) == 0) {
        Serial.println("[Telegram] Missing BOT_TOKEN or CHAT_ID.");
        return false;
    }

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(CLOUD_HTTP_TIMEOUT_MS);

    HTTPClient https;
    https.setConnectTimeout(CLOUD_HTTP_CONNECT_TIMEOUT_MS);
    https.setTimeout(CLOUD_HTTP_TIMEOUT_MS);

    const String url =
        "https://api.telegram.org/bot" + String(TELEGRAM_BOT_TOKEN) + "/sendMessage";

    if (!https.begin(client, url)) {
        Serial.println("[Telegram] Cannot begin HTTPS connection.");
        return false;
    }

    https.addHeader("Content-Type", "application/json");

    JsonDocument requestBody;
    requestBody["chat_id"] = TELEGRAM_CHAT_ID;
    requestBody["text"] = message;
    requestBody["disable_web_page_preview"] = true;

    String payload;
    serializeJson(requestBody, payload);

    const int httpCode = https.POST(payload);
    const String response = https.getString();
    bool apiSuccess = false;

    if (httpCode > 0) {
        JsonDocument responseBody;
        if (!deserializeJson(responseBody, response)) {
            apiSuccess = responseBody["ok"] | false;
        }
    }

    if (httpCode == 200 && apiSuccess) {
        Serial.println("[Telegram] Alert sent.");
    } else {
        Serial.printf("[Telegram] Send failed. HTTP code: %d\n", httpCode);
        Serial.println(response);
    }

    https.end();
    return httpCode == 200 && apiSuccess;
}

bool TelegramManager::sendTestMessage() {
    String message;
    message += "✅ AIR NOISE MONITOR FULL ONLINE\n\n";
    message += "ESP32 đã kết nối.\n";
    message += "OLED, PIR, MPU6050, PM2.5, gas, noise, solar, NeoPixel và relay đã khởi tạo.\n";
    message += "Firmware: ";
    message += FIRMWARE_VERSION;
    return sendMessage(message);
}

bool TelegramManager::sendAlert(const SensorData &data) {
    String message;
    message.reserve(900);

    message += "🚨 CẢNH BÁO AIR NOISE MONITOR\n";
    message += "━━━━━━━━━━━━━━━━━━━━\n";

    if (data.alertTemp) message += "🌡️ Nhiệt độ cao\n";
    if (data.alertHumidity) message += "💧 Độ ẩm cao\n";
    if (data.alertPm25) message += "🌫️ PM2.5 vượt ngưỡng\n";
    if (data.alertGas) message += "🧪 Nồng độ khí vượt ngưỡng\n";
    if (data.alertNoise) message += "🔊 Tiếng ồn vượt ngưỡng\n";
    if (data.alertVibration) message += "📳 Rung/nghiêng bất thường\n";

    message += "\n📊 THÔNG SỐ HIỆN TẠI\n";
    if (data.dhtValid) {
        message += "• Nhiệt độ: " + String(data.temperature, 1) + " °C\n";
        message += "• Độ ẩm: " + String(data.humidity, 1) + " %\n";
    }
    message += "• PM2.5: " + String(data.pm25UgM3, 1) + " µg/m³\n";
    message += "• PM10: " + String(data.pm10UgM3, 1) + " µg/m³\n";
    message += "• Gas: " + String(data.gasPpm, 0) + " ppm*\n";
    message += "• Độ ồn: " + String(data.noiseDb, 1) + " dB*\n";
    message += "• Độ nghiêng: " + String(data.tiltDeg, 1) + "°\n";
    message += "• Rung: " + String(data.vibrationMs2, 2) + " m/s²\n";
    message += "• PIR: ";
    message += data.pirMotion ? "Có chuyển động\n" : "Không phát hiện\n";
    message += "• Solar: " + String(data.solarPercent, 0) + "%\n";
    message += "• Relay: ";
    message += data.relayOn ? "BẬT\n" : "TẮT\n";
    message += "• WiFi RSSI: " + String(data.wifiRssi) + " dBm\n";

    message += "\n🕒 Uptime: " + String(data.timestampMs / 1000UL) + " giây";
    return sendMessage(message);
}
