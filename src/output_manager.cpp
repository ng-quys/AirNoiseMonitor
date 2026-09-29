#include "output_manager.h"
#include "config.h"

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET_PIN);
static Adafruit_NeoPixel matrix(
    NEOPIXEL_COUNT,
    PIN_NEOPIXEL,
    NEO_GRB + NEO_KHZ800
);
static bool displayReady = false;

static uint32_t statusColor(const SensorData &data) {
    if (data.anyAlert) return matrix.Color(160, 0, 0);
    if (data.pirMotion) return matrix.Color(0, 40, 150);
    if (!data.wifiConnected) return matrix.Color(150, 80, 0);
    return matrix.Color(0, 120, 35);
}

void OutputManager::begin() {
    pinMode(PIN_RELAY, OUTPUT);
    setRelay(false);

    matrix.begin();
    matrix.setBrightness(NEOPIXEL_BRIGHTNESS);
    matrix.clear();
    matrix.show();

    displayReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS);
    if (displayReady) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println("AirNoiseMonitor");
        display.println("Khoi dong...");
        display.display();
        Serial.println("[OLED] Ready.");
    } else {
        Serial.println("[OLED] SSD1306 not detected.");
    }
}

void OutputManager::setRelay(bool enabled) {
    relayOn = enabled;
    const uint8_t level = RELAY_ACTIVE_HIGH
        ? (enabled ? HIGH : LOW)
        : (enabled ? LOW : HIGH);
    digitalWrite(PIN_RELAY, level);
}

void OutputManager::updateRelay(const SensorData &data) {
    const bool turnOn =
        (data.dhtValid && data.temperature >= RELAY_TEMP_ON_C) ||
        (data.pm25Valid && data.pm25UgM3 >= RELAY_PM25_ON_UG_M3) ||
        data.gasPpm >= RELAY_GAS_ON_PPM;

    const bool canTurnOff =
        (!data.dhtValid || data.temperature <= RELAY_TEMP_OFF_C) &&
        (!data.pm25Valid || data.pm25UgM3 <= RELAY_PM25_OFF_UG_M3) &&
        data.gasPpm <= RELAY_GAS_OFF_PPM;

    if (!relayOn && turnOn) {
        setRelay(true);
        Serial.println("[Relay] ON - ventilation requested.");
    } else if (relayOn && canTurnOff) {
        setRelay(false);
        Serial.println("[Relay] OFF - environment returned below hysteresis.");
    }
}

void OutputManager::updateMatrix(const SensorData &data) {
    if (millis() - lastMatrixRefresh < 100UL) return;
    lastMatrixRefresh = millis();

    matrix.clear();

    const uint32_t color = statusColor(data);
    int litPixels = 8;

    if (data.anyAlert) {
        litPixels = NEOPIXEL_COUNT;
    } else if (data.pirMotion) {
        litPixels = 32;
    } else if (!data.wifiConnected) {
        litPixels = 16;
    }

    for (int index = 0; index < litPixels; ++index) {
        matrix.setPixelColor(index, color);
    }

    // A moving white pixel makes it obvious that the firmware is alive.
    const int heartbeatPixel = (millis() / 180UL) % NEOPIXEL_COUNT;
    matrix.setPixelColor(heartbeatPixel, matrix.Color(40, 40, 40));
    matrix.show();
}

void OutputManager::updateDisplay(const SensorData &data) {
    if (!displayReady) return;
    if (millis() - lastDisplayRefresh < 400UL) return;
    lastDisplayRefresh = millis();

    if (millis() - lastDisplayPageChange >= DISPLAY_PAGE_INTERVAL_MS) {
        lastDisplayPageChange = millis();
        displayPage = (displayPage + 1) % 3;
    }

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);

    if (displayPage == 0) {
        display.println("MOI TRUONG");
        display.printf("T: %.1fC  H: %.0f%%\n", data.temperature, data.humidity);
        display.printf("PM2.5: %.0f ug/m3\n", data.pm25UgM3);
        display.printf("Gas: %.0f ppm\n", data.gasPpm);
        display.printf("Noise: %.0f dB\n", data.noiseDb);
        display.printf("Relay: %s\n", relayOn ? "ON" : "OFF");
    } else if (displayPage == 1) {
        display.println("CHUYEN DONG / MPU");
        display.printf("PIR: %s\n", data.pirMotion ? "MOTION" : "CLEAR");
        display.printf("Tilt: %.1f deg\n", data.tiltDeg);
        display.printf("Vib: %.2f m/s2\n", data.vibrationMs2);
        display.printf("Ax: %.1f Ay: %.1f\n", data.accelX, data.accelY);
        display.printf("Az: %.1f\n", data.accelZ);
    } else {
        display.println("HE THONG");
        display.printf("WiFi: %s\n", data.wifiConnected ? "ONLINE" : "OFFLINE");
        if (data.wifiConnected) {
            display.printf("RSSI: %d dBm\n", data.wifiRssi);
        }
        display.printf("Solar: %.0f%%\n", data.solarPercent);
        display.printf("OTA: %s\n", data.otaReady ? "READY" : "OFF");
        display.printf("BT cfg: %s\n", data.bluetoothProvisioning ? "ON" : "OFF");
    }

    display.display();
}

void OutputManager::update(SensorData &data) {
    updateRelay(data);
    data.relayOn = relayOn;
    updateMatrix(data);
    updateDisplay(data);
}

bool OutputManager::relayState() const {
    return relayOn;
}
