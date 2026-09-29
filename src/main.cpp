#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <math.h>

#include "config.h"
#include "wifi_manager.h"
#include "sensor_manager.h"
#include "firebase_manager.h"
#include "telegram_manager.h"
#include "output_manager.h"

WifiManager wifiManager;
SensorManager sensorManager;
FirebaseManager firebaseManager;
TelegramManager telegramManager;
OutputManager outputManager;

static unsigned long lastSensorRead = 0;
static unsigned long lastLatestUpload = 0;
static unsigned long lastHistoryUpload = 0;
static unsigned long lastTelegramAlert = 0;
static unsigned long lastTelegramAttempt = 0;

static bool hasSensorReading = false;
static bool telegramAlertSent = false;
static SensorData lastTelegramData;

static void printReading(const SensorData &data) {
    Serial.println("------------------------------------------------------------");
    if (data.dhtValid) {
        Serial.printf("DHT22        : %.1f C | %.1f %%\n", data.temperature, data.humidity);
    } else {
        Serial.println("DHT22        : read failed");
    }

    Serial.printf("PIR          : %s\n", data.pirMotion ? "MOTION" : "clear");
    Serial.printf("MPU6050      : tilt %.1f deg | vibration %.2f m/s2\n",
                  data.tiltDeg, data.vibrationMs2);
    Serial.printf("PM2.5 / PM10 : %.1f / %.1f ug/m3\n",
                  data.pm25UgM3, data.pm10UgM3);
    Serial.printf("Gas          : %.0f ppm* | AQI* %d | %.2f V\n",
                  data.gasPpm, data.airQualityIndex, data.gasVoltage);
    Serial.printf("Noise        : %.1f dB*\n", data.noiseDb);
    Serial.printf("Solar        : %.0f %% | %.0f lux | %.2f V | %.2f W\n",
                  data.solarPercent, data.solarLux,
                  data.solarVoltage, data.solarPowerW);
    Serial.printf("Relay        : %s\n", data.relayOn ? "ON" : "OFF");
    Serial.printf("WiFi         : %s | %s | %d dBm\n",
                  data.wifiConnected ? "ONLINE" : "OFFLINE",
                  data.wifiSsid.c_str(), data.wifiRssi);

    if (data.anyAlert) {
        Serial.print("ALERTS       :");
        if (data.alertTemp) Serial.print(" [TEMP]");
        if (data.alertHumidity) Serial.print(" [HUMIDITY]");
        if (data.alertPm25) Serial.print(" [PM2.5]");
        if (data.alertGas) Serial.print(" [GAS]");
        if (data.alertNoise) Serial.print(" [NOISE]");
        if (data.alertVibration) Serial.print(" [VIBRATION/TILT]");
        Serial.println();
    }
}

static bool alertChangedSignificantly(const SensorData &current) {
    if (!telegramAlertSent) return true;

    if (current.alertTemp != lastTelegramData.alertTemp ||
        current.alertHumidity != lastTelegramData.alertHumidity ||
        current.alertPm25 != lastTelegramData.alertPm25 ||
        current.alertGas != lastTelegramData.alertGas ||
        current.alertNoise != lastTelegramData.alertNoise ||
        current.alertVibration != lastTelegramData.alertVibration) {
        return true;
    }

    if (current.alertTemp &&
        fabsf(current.temperature - lastTelegramData.temperature) >= TELEGRAM_TEMP_CHANGE_NOTIFY_C) {
        return true;
    }
    if (current.alertPm25 &&
        fabsf(current.pm25UgM3 - lastTelegramData.pm25UgM3) >= TELEGRAM_PM25_CHANGE_NOTIFY_UG_M3) {
        return true;
    }
    if (current.alertGas &&
        fabsf(current.gasPpm - lastTelegramData.gasPpm) >= TELEGRAM_GAS_CHANGE_NOTIFY_PPM) {
        return true;
    }
    if (current.alertNoise &&
        fabsf(current.noiseDb - lastTelegramData.noiseDb) >= TELEGRAM_NOISE_CHANGE_NOTIFY_DB) {
        return true;
    }

    return false;
}

static void blinkStatusLed(bool alert) {
    static unsigned long lastToggle = 0;
    static bool state = false;
    const unsigned long interval = alert ? 150UL : 1000UL;

    if (millis() - lastToggle >= interval) {
        lastToggle = millis();
        state = !state;
        digitalWrite(PIN_STATUS_LED, state);
    }
}

void setup() {
    Serial.begin(115200);
    delay(400);
    Serial.printf("\n=== AirNoiseMonitor Full %s ===\n", FIRMWARE_VERSION);

    pinMode(PIN_STATUS_LED, OUTPUT);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    sensorManager.begin();
    outputManager.begin();
    firebaseManager.begin();

    const bool wifiOk = wifiManager.begin();
    if (wifiOk) {
        telegramManager.sendTestMessage();
    } else {
        Serial.println("[Setup] Offline mode. Auto reconnect remains active.");
    }
}

void loop() {
    wifiManager.loop();

    unsigned long now = millis();
    static SensorData lastData;
    bool newSensorSample = false;

    if (!hasSensorReading || now - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
        lastSensorRead = now;
        lastData = sensorManager.readAll();

        lastData.wifiConnected = wifiManager.isConnected();
        lastData.wifiRssi = wifiManager.rssi();
        lastData.wifiSsid = wifiManager.currentSsid();
        lastData.otaReady = wifiManager.otaReady();
        lastData.bluetoothProvisioning = wifiManager.bluetoothProvisioningEnabled();

        outputManager.update(lastData);

        hasSensorReading = true;
        newSensorSample = true;
        printReading(lastData);
    } else if (hasSensorReading) {
        // Keep OLED/NeoPixel animations alive between sensor samples.
        lastData.wifiConnected = wifiManager.isConnected();
        lastData.wifiRssi = wifiManager.rssi();
        lastData.otaReady = wifiManager.otaReady();
        outputManager.update(lastData);
    }

    now = millis();
    if (wifiManager.isConnected() && newSensorSample &&
        (lastLatestUpload == 0 || now - lastLatestUpload >= LATEST_UPLOAD_INTERVAL_MS)) {
        if (firebaseManager.pushLatest(lastData)) {
            lastLatestUpload = millis();
            Serial.println("[Firebase] latest=OK");
        } else {
            Serial.println("[Firebase] latest=FAIL; retry on next sample.");
        }
    }

    now = millis();
    if (wifiManager.isConnected() && hasSensorReading &&
        (lastHistoryUpload == 0 || now - lastHistoryUpload >= HISTORY_UPLOAD_INTERVAL_MS)) {
        if (firebaseManager.pushHistory(lastData)) {
            lastHistoryUpload = millis();
            Serial.println("[Firebase] history=OK");
        } else {
            Serial.println("[Firebase] history=FAIL");
        }
    }

    now = millis();
    if (hasSensorReading && lastData.anyAlert) {
        const bool firstAlert = !telegramAlertSent;
        const bool changedAlert = alertChangedSignificantly(lastData);
        const bool reminderDue = telegramAlertSent &&
            (now - lastTelegramAlert >= TELEGRAM_ALERT_COOLDOWN_MS);
        const bool retryAllowed = lastTelegramAttempt == 0 ||
            (now - lastTelegramAttempt >= TELEGRAM_RETRY_INTERVAL_MS);

        if (wifiManager.isConnected() && retryAllowed &&
            (firstAlert || changedAlert || reminderDue)) {
            lastTelegramAttempt = now;
            Serial.printf("[Telegram] first=%s changed=%s reminder=%s\n",
                          firstAlert ? "YES" : "NO",
                          changedAlert ? "YES" : "NO",
                          reminderDue ? "YES" : "NO");

            if (telegramManager.sendAlert(lastData)) {
                lastTelegramAlert = millis();
                lastTelegramData = lastData;
                telegramAlertSent = true;
            }
        }
    } else {
        if (telegramAlertSent) Serial.println("[Telegram] Alerts cleared; timer reset.");
        telegramAlertSent = false;
        lastTelegramAlert = 0;
        lastTelegramAttempt = 0;
    }

    blinkStatusLed(hasSensorReading && lastData.anyAlert);
    delay(5);
}
