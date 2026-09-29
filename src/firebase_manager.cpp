#include "firebase_manager.h"
#include "config.h"

#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void FirebaseManager::begin() {}

String FirebaseManager::buildJsonPayload(const SensorData &data) {
    JsonDocument doc;

    if (data.dhtValid) {
        doc["temperature"] = data.temperature;
        doc["humidity"] = data.humidity;
    } else {
        doc["temperature"] = nullptr;
        doc["humidity"] = nullptr;
    }
    doc["dhtValid"] = data.dhtValid;

    doc["pirMotion"] = data.pirMotion;

    doc["mpuValid"] = data.mpuValid;
    doc["accelX"] = data.accelX;
    doc["accelY"] = data.accelY;
    doc["accelZ"] = data.accelZ;
    doc["gyroX"] = data.gyroX;
    doc["gyroY"] = data.gyroY;
    doc["gyroZ"] = data.gyroZ;
    doc["vibrationMs2"] = data.vibrationMs2;
    doc["tiltDeg"] = data.tiltDeg;

    doc["pm25Raw"] = data.pm25Raw;
    doc["pm25UgM3"] = data.pm25UgM3;
    doc["pm10UgM3"] = data.pm10UgM3;
    doc["pm25Valid"] = data.pm25Valid;

    doc["gasRaw"] = data.gasRaw;
    doc["gasVoltage"] = data.gasVoltage;
    doc["gasPpm"] = data.gasPpm;
    doc["airQualityIndex"] = data.airQualityIndex;

    doc["soundRaw"] = data.soundRaw;
    doc["soundPeakToPeak"] = data.soundPeakToPeak;
    doc["noiseDb"] = data.noiseDb;

    doc["solarRaw"] = data.solarRaw;
    doc["solarLux"] = data.solarLux;
    doc["solarPercent"] = data.solarPercent;
    doc["solarVoltage"] = data.solarVoltage;
    doc["solarPowerW"] = data.solarPowerW;

    doc["relayOn"] = data.relayOn;

    doc["wifiConnected"] = data.wifiConnected;
    doc["wifiRssi"] = data.wifiRssi;
    doc["wifiSsid"] = data.wifiSsid;
    doc["otaReady"] = data.otaReady;
    doc["bluetoothProvisioning"] = data.bluetoothProvisioning;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["wokwiSimulation"] = static_cast<bool>(WOKWI_SIMULATION);

    doc["alertTemp"] = data.alertTemp;
    doc["alertHumidity"] = data.alertHumidity;
    doc["alertPm25"] = data.alertPm25;
    doc["alertGas"] = data.alertGas;
    doc["alertNoise"] = data.alertNoise;
    doc["alertVibration"] = data.alertVibration;
    doc["anyAlert"] = data.anyAlert;

    doc["uptimeMs"] = data.timestampMs;
    doc["serverTimestamp"][".sv"] = "timestamp";

    String output;
    serializeJson(doc, output);
    return output;
}

static bool sendRequest(const String &url, const String &method, const String &body) {
    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(CLOUD_HTTP_TIMEOUT_MS);

    HTTPClient https;
    https.setConnectTimeout(CLOUD_HTTP_CONNECT_TIMEOUT_MS);
    https.setTimeout(CLOUD_HTTP_TIMEOUT_MS);

    if (!https.begin(client, url)) {
        Serial.println("[Firebase] Unable to begin HTTPS connection.");
        return false;
    }

    https.addHeader("Content-Type", "application/json");

    const int code = method == "PUT" ? https.PUT(body) : https.POST(body);
    const bool ok = code >= 200 && code < 300;

    if (!ok) {
        Serial.printf("[Firebase] %s failed, HTTP code: %d\n", method.c_str(), code);
        Serial.println(https.getString());
    }

    https.end();
    return ok;
}

bool FirebaseManager::pushLatest(const SensorData &data) {
    String url = "https://" + String(FIREBASE_HOST) + String(FIREBASE_PATH_LATEST) + ".json";
    if (strlen(FIREBASE_AUTH) > 0) url += "?auth=" + String(FIREBASE_AUTH);
    return sendRequest(url, "PUT", buildJsonPayload(data));
}

bool FirebaseManager::pushHistory(const SensorData &data) {
    String url = "https://" + String(FIREBASE_HOST) + String(FIREBASE_PATH_HISTORY) + ".json";
    if (strlen(FIREBASE_AUTH) > 0) url += "?auth=" + String(FIREBASE_AUTH);
    return sendRequest(url, "POST", buildJsonPayload(data));
}
