#include "sensor_manager.h"
#include "config.h"

#include <DHT.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

static DHT dht(PIN_DHT22, DHT_TYPE);
static Adafruit_MPU6050 mpu;
static HardwareSerial pmsSerial(2);
static bool mpuReady = false;

void SensorManager::begin() {
    dht.begin();

    pinMode(PIN_PIR, INPUT);
    pinMode(PIN_PM25_ANALOG, INPUT);
    pinMode(PIN_GAS, INPUT);
    pinMode(PIN_SOUND, INPUT);
    pinMode(PIN_SOLAR, INPUT);

    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    mpuReady = mpu.begin(0x68, &Wire);

    if (mpuReady) {
        mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
        mpu.setGyroRange(MPU6050_RANGE_500_DEG);
        mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
        Serial.println("[MPU6050] Ready.");
    } else {
        Serial.println("[MPU6050] Not detected; continuing without it.");
    }

#if PM25_SENSOR_MODE == 1
    pmsSerial.begin(9600, SERIAL_8N1, PIN_PM25_RX, PIN_PM25_TX);
    Serial.println("[PM2.5] PMS5003 UART mode enabled.");
#else
    Serial.println("[PM2.5] Wokwi analog simulator mode enabled.");
#endif
}

float SensorManager::readNoisePeakToPeak() {
    int minValue = 4095;
    int maxValue = 0;
    const unsigned long start = millis();

    while (millis() - start < SOUND_SAMPLE_WINDOW_MS) {
        const int value = analogRead(PIN_SOUND);
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
        delayMicroseconds(100);
    }

    return static_cast<float>(maxValue - minValue);
}

float SensorManager::estimateNoiseDb(int raw, float peakToPeak) const {
#if NOISE_SENSOR_MODE == 1
    const float normalized = constrain(peakToPeak / 4095.0f, 0.0f, 1.0f);
#else
    const float normalized = constrain(raw / 4095.0f, 0.0f, 1.0f);
#endif
    return 30.0f + normalized * 70.0f;
}

bool SensorManager::readPms5003Frame(float &pm25, float &pm10) {
#if PM25_SENSOR_MODE == 1
    static uint8_t frame[32];

    while (pmsSerial.available() >= 32) {
        if (pmsSerial.peek() != 0x42) {
            pmsSerial.read();
            continue;
        }

        if (pmsSerial.readBytes(frame, sizeof(frame)) != sizeof(frame)) {
            return false;
        }

        if (frame[0] != 0x42 || frame[1] != 0x4D) {
            continue;
        }

        uint16_t checksum = 0;
        for (int i = 0; i < 30; ++i) checksum += frame[i];
        const uint16_t expected = (static_cast<uint16_t>(frame[30]) << 8) | frame[31];

        if (checksum != expected) {
            Serial.println("[PM2.5] PMS5003 checksum mismatch.");
            continue;
        }

        pm25 = static_cast<float>((static_cast<uint16_t>(frame[12]) << 8) | frame[13]);
        pm10 = static_cast<float>((static_cast<uint16_t>(frame[14]) << 8) | frame[15]);
        return true;
    }
#endif
    return false;
}

void SensorManager::readPm25(SensorData &data) {
#if PM25_SENSOR_MODE == 1
    float pm25 = 0.0f;
    float pm10 = 0.0f;
    data.pm25Valid = readPms5003Frame(pm25, pm10);
    if (data.pm25Valid) {
        data.pm25UgM3 = pm25;
        data.pm10UgM3 = pm10;
    }
#else
    data.pm25Raw = analogRead(PIN_PM25_ANALOG);
    data.pm25UgM3 = (data.pm25Raw / 4095.0f) * PM25_SIM_MAX_UG_M3;
    data.pm10UgM3 = constrain(data.pm25UgM3 * 1.25f, 0.0f, 650.0f);
    data.pm25Valid = true;
#endif
}

float SensorManager::calculateLux(int raw) const {
    const float voltage = (raw / 4095.0f) * 3.3f;
    if (voltage <= 0.001f) return 100000.0f;
    if (voltage >= 3.299f) return 0.1f;

    const float resistance = 10000.0f * voltage / (3.3f - voltage);
    const float numerator = LDR_RL10_KOHM * 1000.0f * powf(10.0f, LDR_GAMMA);
    const float lux = powf(numerator / resistance, 1.0f / LDR_GAMMA);

    if (!isfinite(lux)) return 100000.0f;
    return constrain(lux, 0.1f, 100000.0f);
}

SensorData SensorManager::readAll() {
    SensorData data;
    data.timestampMs = millis();

    const float humidity = dht.readHumidity();
    const float temperature = dht.readTemperature();
    data.dhtValid = !(isnan(humidity) || isnan(temperature));
    if (data.dhtValid) {
        data.temperature = temperature;
        data.humidity = humidity;
    }

    data.pirMotion = digitalRead(PIN_PIR) == HIGH;

    data.mpuValid = mpuReady;
    if (mpuReady) {
        sensors_event_t accelEvent;
        sensors_event_t gyroEvent;
        sensors_event_t tempEvent;
        mpu.getEvent(&accelEvent, &gyroEvent, &tempEvent);

        data.accelX = accelEvent.acceleration.x;
        data.accelY = accelEvent.acceleration.y;
        data.accelZ = accelEvent.acceleration.z;
        data.gyroX = gyroEvent.gyro.x;
        data.gyroY = gyroEvent.gyro.y;
        data.gyroZ = gyroEvent.gyro.z;

        const float accelerationMagnitude = sqrtf(
            data.accelX * data.accelX +
            data.accelY * data.accelY +
            data.accelZ * data.accelZ
        );
        data.vibrationMs2 = fabsf(accelerationMagnitude - 9.80665f);

        if (accelerationMagnitude > 0.01f) {
            const float cosine = constrain(data.accelZ / accelerationMagnitude, -1.0f, 1.0f);
            data.tiltDeg = acosf(cosine) * 180.0f / PI;
        }
    }

    readPm25(data);

    data.gasRaw = analogRead(PIN_GAS);
    data.gasVoltage = (data.gasRaw / 4095.0f) * 3.3f;
    data.gasPpm = (data.gasRaw / 4095.0f) * GAS_SIM_MAX_PPM;
    data.airQualityIndex = static_cast<int>(constrain((data.gasRaw / 4095.0f) * 500.0f, 0.0f, 500.0f));

    data.soundRaw = analogRead(PIN_SOUND);
    data.soundPeakToPeak = readNoisePeakToPeak();
    data.noiseDb = estimateNoiseDb(data.soundRaw, data.soundPeakToPeak);

    data.solarRaw = analogRead(PIN_SOLAR);
#if SOLAR_SENSOR_MODE == 1
    // Real solar input: GPIO33 must receive no more than 3.3V.
    const float adcVoltage = (data.solarRaw / 4095.0f) * 3.3f;
    data.solarVoltage = adcVoltage * SOLAR_VOLTAGE_DIVIDER_RATIO;
    data.solarPercent = constrain(
        (data.solarVoltage / SOLAR_PANEL_MAX_VOLTAGE) * 100.0f,
        0.0f,
        100.0f
    );
    // Power remains an estimate until a current sensor such as INA219 is added.
    data.solarPowerW = SOLAR_PANEL_MAX_POWER_W * data.solarPercent / 100.0f;
    data.solarLux = 0.0f;
#else
    // Wokwi uses an LDR as a controllable sunlight/solar simulator.
    data.solarLux = calculateLux(data.solarRaw);
    const float normalizedLog = (log10f(max(data.solarLux, 0.1f)) + 1.0f) / 6.0f;
    data.solarPercent = constrain(normalizedLog * 100.0f, 0.0f, 100.0f);
    data.solarVoltage = SOLAR_PANEL_MAX_VOLTAGE * data.solarPercent / 100.0f;
    data.solarPowerW = SOLAR_PANEL_MAX_POWER_W * data.solarPercent / 100.0f;
#endif

    data.alertTemp = data.dhtValid && data.temperature >= TEMP_HIGH_C;
    data.alertHumidity = data.dhtValid && data.humidity >= HUMIDITY_HIGH_PCT;
    data.alertPm25 = data.pm25Valid && data.pm25UgM3 >= PM25_WARN_UG_M3;
    data.alertGas = data.gasPpm >= GAS_WARN_PPM;
    data.alertNoise = data.noiseDb >= NOISE_WARN_DB;
    data.alertVibration = data.mpuValid &&
        (data.vibrationMs2 >= VIBRATION_WARN_MS2 || data.tiltDeg >= TILT_WARN_DEG);

    data.anyAlert = data.alertTemp || data.alertHumidity || data.alertPm25 ||
        data.alertGas || data.alertNoise || data.alertVibration;

    return data;
}
