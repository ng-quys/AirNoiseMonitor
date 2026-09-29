#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>

class WifiManager {
public:
    bool begin();
    void loop();
    void ensureConnected();

    bool isConnected() const;
    String currentSsid() const;
    String ipAddress() const;
    int rssi() const;
    bool otaReady() const;
    bool bluetoothProvisioningEnabled() const;

private:
    String ssid;
    String password;
    String serialBuffer;
    String bluetoothBuffer;

    unsigned long lastRetryAttempt = 0;
    bool otaStarted = false;
    bool bluetoothStarted = false;

    void loadCredentials();
    void saveCredentials(const String &newSsid, const String &newPassword);
    void clearCredentials();
    bool connectWithTimeout();
    void reconnect();
    void processSerialProvisioning();
    void processBluetoothProvisioning();
    void processProvisioningCommand(const String &command, Stream &replyStream);
    void startBluetooth();
    void startOtaIfNeeded();
};

#endif
