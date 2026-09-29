#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <Arduino.h>

struct SensorData {
    float temperature = 0.0f;
    float humidity = 0.0f;
    bool dhtValid = false;

    bool pirMotion = false;

    bool mpuValid = false;
    float accelX = 0.0f;
    float accelY = 0.0f;
    float accelZ = 0.0f;
    float gyroX = 0.0f;
    float gyroY = 0.0f;
    float gyroZ = 0.0f;
    float vibrationMs2 = 0.0f;
    float tiltDeg = 0.0f;

    int pm25Raw = 0;
    float pm25UgM3 = 0.0f;
    float pm10UgM3 = 0.0f;
    bool pm25Valid = false;

    int gasRaw = 0;
    float gasVoltage = 0.0f;
    float gasPpm = 0.0f;
    int airQualityIndex = 0;

    int soundRaw = 0;
    float soundPeakToPeak = 0.0f;
    float noiseDb = 0.0f;

    int solarRaw = 0;
    float solarLux = 0.0f;
    float solarPercent = 0.0f;
    float solarVoltage = 0.0f;
    float solarPowerW = 0.0f;

    bool relayOn = false;
    bool wifiConnected = false;
    int wifiRssi = 0;
    String wifiSsid;
    bool otaReady = false;
    bool bluetoothProvisioning = false;

    bool alertTemp = false;
    bool alertHumidity = false;
    bool alertPm25 = false;
    bool alertGas = false;
    bool alertNoise = false;
    bool alertVibration = false;
    bool anyAlert = false;

    unsigned long timestampMs = 0;
};

class SensorManager {
public:
    void begin();
    SensorData readAll();

private:
    float readNoisePeakToPeak();
    float estimateNoiseDb(int raw, float peakToPeak) const;
    void readPm25(SensorData &data);
    bool readPms5003Frame(float &pm25, float &pm10);
    float calculateLux(int raw) const;
};

#endif
