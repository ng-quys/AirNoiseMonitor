#include "wifi_manager.h"
#include "config.h"

#include <WiFi.h>
#include <Preferences.h>

#if ENABLE_BLUETOOTH_PROVISIONING
#include <BluetoothSerial.h>
static BluetoothSerial SerialBT;
#endif

#if ENABLE_OTA
#include <ArduinoOTA.h>
#endif

static Preferences preferences;

void WifiManager::loadCredentials() {
    preferences.begin(WIFI_PREFERENCES_NS, true);
    ssid = preferences.getString(WIFI_PREF_KEY_SSID, "");
    password = preferences.getString(WIFI_PREF_KEY_PASSWORD, "");
    preferences.end();

    if (ssid.length() == 0) {
        ssid = WIFI_DEFAULT_SSID;
        password = WIFI_DEFAULT_PASSWORD;
        Serial.printf("[WiFi] Using default SSID: %s\n", ssid.c_str());
    } else {
        Serial.printf("[WiFi] Loaded SSID from Preferences: %s\n", ssid.c_str());
    }
}

void WifiManager::saveCredentials(const String &newSsid, const String &newPassword) {
    preferences.begin(WIFI_PREFERENCES_NS, false);
    preferences.putString(WIFI_PREF_KEY_SSID, newSsid);
    preferences.putString(WIFI_PREF_KEY_PASSWORD, newPassword);
    preferences.end();

    ssid = newSsid;
    password = newPassword;
    Serial.printf("[WiFi] Credentials saved for SSID: %s\n", ssid.c_str());
}

void WifiManager::clearCredentials() {
    preferences.begin(WIFI_PREFERENCES_NS, false);
    preferences.clear();
    preferences.end();

    ssid = WIFI_DEFAULT_SSID;
    password = WIFI_DEFAULT_PASSWORD;
    Serial.println("[WiFi] Saved credentials cleared; default restored.");
}

void WifiManager::startBluetooth() {
#if ENABLE_BLUETOOTH_PROVISIONING
    bluetoothStarted = SerialBT.begin(BLUETOOTH_DEVICE_NAME);
    if (bluetoothStarted) {
        Serial.printf("[Bluetooth] Provisioning ready: %s\n", BLUETOOTH_DEVICE_NAME);
        Serial.println("[Bluetooth] Send WIFI:ssid|password");
    } else {
        Serial.println("[Bluetooth] Failed to start Bluetooth Serial.");
    }
#else
    bluetoothStarted = false;
    Serial.println("[Bluetooth] Disabled in this build profile. Use Serial provisioning in Wokwi.");
#endif
}

bool WifiManager::connectWithTimeout() {
    if (ssid.length() == 0) return false;

    Serial.printf("[WiFi] Connecting to \"%s\" ...\n", ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
#if WOKWI_SIMULATION
    // Wokwi-GUEST runs on channel 6; providing it skips the scan phase.
    WiFi.begin(ssid.c_str(), password.c_str(), 6);
#else
    WiFi.begin(ssid.c_str(), password.c_str());
#endif

    const unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
        delay(250);
        Serial.print('.');
        processSerialProvisioning();
        processBluetoothProvisioning();
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WiFi] Connected. IP: %s, RSSI: %d dBm\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        startOtaIfNeeded();
        return true;
    }

    Serial.println("[WiFi] Connection timeout. Offline mode remains active.");
    return false;
}

bool WifiManager::begin() {
    loadCredentials();
    startBluetooth();

    Serial.println("[Provisioning] USB Serial commands: WIFI:ssid|password, WIFI?, WIFI:CLEAR");
    return connectWithTimeout();
}

void WifiManager::reconnect() {
    if (ssid.length() == 0) return;

    Serial.printf("[WiFi] Reconnecting to %s ...\n", ssid.c_str());
    WiFi.disconnect(false, false);
    delay(50);
#if WOKWI_SIMULATION
    WiFi.begin(ssid.c_str(), password.c_str(), 6);
#else
    WiFi.begin(ssid.c_str(), password.c_str());
#endif
}

void WifiManager::processProvisioningCommand(const String &rawCommand, Stream &replyStream) {
    String command = rawCommand;
    command.trim();
    if (command.length() == 0) return;

    if (command.equalsIgnoreCase("WIFI?")) {
        replyStream.printf("SSID=%s STATUS=%s IP=%s\n",
                           ssid.c_str(),
                           isConnected() ? "CONNECTED" : "DISCONNECTED",
                           ipAddress().c_str());
        return;
    }

    if (command.equalsIgnoreCase("WIFI:CLEAR")) {
        clearCredentials();
        replyStream.println("OK: credentials cleared; reconnecting with default WiFi.");
        reconnect();
        return;
    }

    if (!command.startsWith("WIFI:")) {
        replyStream.println("ERR: use WIFI:ssid|password, WIFI?, or WIFI:CLEAR");
        return;
    }

    const String payload = command.substring(5);
    const int separator = payload.indexOf('|');

    String newSsid;
    String newPassword;

    if (separator < 0) {
        newSsid = payload;
        newPassword = "";
    } else {
        newSsid = payload.substring(0, separator);
        newPassword = payload.substring(separator + 1);
    }

    newSsid.trim();
    if (newSsid.length() == 0) {
        replyStream.println("ERR: SSID cannot be empty.");
        return;
    }

    saveCredentials(newSsid, newPassword);
    replyStream.printf("OK: saved SSID %s; reconnecting.\n", newSsid.c_str());
    reconnect();
}

void WifiManager::processSerialProvisioning() {
    while (Serial.available()) {
        const char character = static_cast<char>(Serial.read());
        if (character == '\n' || character == '\r') {
            if (serialBuffer.length() != 0) {
                processProvisioningCommand(serialBuffer, Serial);
                serialBuffer = "";
            }
        } else if (serialBuffer.length() < 160) {
            serialBuffer += character;
        }
    }
}

void WifiManager::processBluetoothProvisioning() {
#if ENABLE_BLUETOOTH_PROVISIONING
    if (!bluetoothStarted) return;

    while (SerialBT.available()) {
        const char character = static_cast<char>(SerialBT.read());
        if (character == '\n' || character == '\r') {
            if (bluetoothBuffer.length() != 0) {
                processProvisioningCommand(bluetoothBuffer, SerialBT);
                bluetoothBuffer = "";
            }
        } else if (bluetoothBuffer.length() < 160) {
            bluetoothBuffer += character;
        }
    }
#endif
}

void WifiManager::startOtaIfNeeded() {
#if ENABLE_OTA
    if (otaStarted || WiFi.status() != WL_CONNECTED) return;

    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);

    ArduinoOTA.onStart([]() {
        Serial.println("[OTA] Update started.");
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA] Update completed.");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress * 100U) / total);
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error %u\n", error);
    });

    ArduinoOTA.begin();
    otaStarted = true;
    Serial.printf("[OTA] Ready. Hostname: %s.local\n", OTA_HOSTNAME);
#else
    otaStarted = false;
#endif
}

void WifiManager::loop() {
    processSerialProvisioning();
    processBluetoothProvisioning();

    if (WiFi.status() == WL_CONNECTED) {
        startOtaIfNeeded();
#if ENABLE_OTA
        if (otaStarted) ArduinoOTA.handle();
#endif
        return;
    }

    const unsigned long now = millis();
    if (now - lastRetryAttempt >= WIFI_RETRY_INTERVAL_MS) {
        lastRetryAttempt = now;
        reconnect();
    }
}

void WifiManager::ensureConnected() {
    loop();
}

bool WifiManager::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

String WifiManager::currentSsid() const {
    return ssid;
}

String WifiManager::ipAddress() const {
    return isConnected() ? WiFi.localIP().toString() : String("--");
}

int WifiManager::rssi() const {
    return isConnected() ? WiFi.RSSI() : 0;
}

bool WifiManager::otaReady() const {
    return otaStarted;
}

bool WifiManager::bluetoothProvisioningEnabled() const {
    return bluetoothStarted;
}
