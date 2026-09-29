#ifndef AIRNOISEMONITOR_CONFIG_H
#define AIRNOISEMONITOR_CONFIG_H

#include <Arduino.h>

// Optional local secrets file. It is intentionally ignored by Git.
#if __has_include("secrets.h")
#include "secrets.h"
#endif

// =====================================================================
// BUILD PROFILE
// PlatformIO supplies these flags per environment. The fallbacks make
// the project compile even when a custom build system is used.
// =====================================================================
#ifndef WOKWI_SIMULATION
#define WOKWI_SIMULATION 1
#endif

#ifndef ENABLE_BLUETOOTH_PROVISIONING
#define ENABLE_BLUETOOTH_PROVISIONING 0
#endif

#ifndef ENABLE_OTA
#define ENABLE_OTA 0
#endif

// 0 = potentiometer simulator on GPIO32, 1 = PMS5003 over UART2.
#ifndef PM25_SENSOR_MODE
#define PM25_SENSOR_MODE 0
#endif

// 0 = direct analog level (Wokwi potentiometer), 1 = microphone P2P.
#ifndef NOISE_SENSOR_MODE
#define NOISE_SENSOR_MODE 0
#endif

// 0 = LDR/light simulator, 1 = solar-panel voltage through a divider.
#ifndef SOLAR_SENSOR_MODE
#define SOLAR_SENSOR_MODE 0
#endif

#define FIRMWARE_VERSION "3.0.0-full"

// =====================================================================
// WIFI / PREFERENCES / BLUETOOTH PROVISIONING
// =====================================================================
#ifndef WIFI_DEFAULT_SSID
#define WIFI_DEFAULT_SSID       "Wokwi-GUEST"
#endif
#ifndef WIFI_DEFAULT_PASSWORD
#define WIFI_DEFAULT_PASSWORD   ""
#endif
#define WIFI_CONNECT_TIMEOUT_MS 15000UL
#define WIFI_RETRY_INTERVAL_MS  5000UL
#define WIFI_PREFERENCES_NS     "airnoise"
#define WIFI_PREF_KEY_SSID      "ssid"
#define WIFI_PREF_KEY_PASSWORD  "password"

#define BLUETOOTH_DEVICE_NAME   "AirNoiseMonitor-Setup"
// Commands accepted from Bluetooth Serial and the USB Serial Monitor:
// WIFI:your_ssid|your_password
// WIFI?
// WIFI:CLEAR

// =====================================================================
// OTA (real ESP32 profile)
// =====================================================================
#define OTA_HOSTNAME "airnoise-monitor"
#ifndef OTA_PASSWORD
#define OTA_PASSWORD ""
#endif

// =====================================================================
// FIREBASE REALTIME DATABASE
// =====================================================================
#define FIREBASE_HOST   "airnoisemonitor-58521-default-rtdb.asia-southeast1.firebasedatabase.app"
#ifndef FIREBASE_AUTH
#define FIREBASE_AUTH   ""
#endif
#define FIREBASE_PATH_LATEST   "/airnoise/latest"
#define FIREBASE_PATH_HISTORY  "/airnoise/history"

// =====================================================================
// PIN MAP
// All analog inputs are ADC1 pins, so they remain usable while WiFi runs.
// =====================================================================
#define PIN_DHT22        4
#define DHT_TYPE         DHT22

#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22

#define PIN_PIR          27
#define PIN_PM25_ANALOG  32
#define PIN_SOLAR        33
#define PIN_GAS          34
#define PIN_SOUND        35

#define PIN_PM25_RX      16   // ESP32 RX2 <- PMS5003 TX
#define PIN_PM25_TX      17   // ESP32 TX2 -> PMS5003 RX (normally unused)

#define PIN_NEOPIXEL     5
#define NEOPIXEL_ROWS    8
#define NEOPIXEL_COLS    8
#define NEOPIXEL_COUNT   (NEOPIXEL_ROWS * NEOPIXEL_COLS)
#define NEOPIXEL_BRIGHTNESS 24

#define PIN_RELAY        23
#define RELAY_ACTIVE_HIGH true

#define PIN_STATUS_LED   2

// OLED SSD1306 128x64 on the shared I2C bus.
#define OLED_WIDTH       128
#define OLED_HEIGHT      64
#define OLED_I2C_ADDRESS 0x3C
#define OLED_RESET_PIN   -1

// =====================================================================
// TIMING
// =====================================================================
#define SENSOR_READ_INTERVAL_MS          2000UL
#define LATEST_UPLOAD_INTERVAL_MS        2000UL
#define HISTORY_UPLOAD_INTERVAL_MS       10000UL
#define SOUND_SAMPLE_WINDOW_MS           50UL
#define DISPLAY_PAGE_INTERVAL_MS         2500UL
#define CLOUD_HTTP_CONNECT_TIMEOUT_MS    3000UL
#define CLOUD_HTTP_TIMEOUT_MS            5000UL

// =====================================================================
// SENSOR CALIBRATION / DEMO MAPPING
// =====================================================================
#define PM25_SIM_MAX_UG_M3       500.0f
#define GAS_SIM_MAX_PPM          1000.0f
#define SOLAR_PANEL_MAX_VOLTAGE  6.0f
#define SOLAR_PANEL_MAX_POWER_W  3.0f
// Real profile: actual panel voltage = ADC voltage × divider ratio.
// Example 100k/100k divider => ratio 2.0 and safe input up to about 6.6V.
#define SOLAR_VOLTAGE_DIVIDER_RATIO 2.0f
#define LDR_GAMMA                0.7f
#define LDR_RL10_KOHM            50.0f

// =====================================================================
// ALERT THRESHOLDS
// =====================================================================
#define TEMP_HIGH_C              35.0f
#define HUMIDITY_HIGH_PCT        85.0f
#define PM25_WARN_UG_M3          35.0f
#define PM25_DANGER_UG_M3        75.0f
#define GAS_WARN_PPM             450.0f
#define GAS_DANGER_PPM           700.0f
#define NOISE_WARN_DB            70.0f
#define NOISE_DANGER_DB          85.0f
#define VIBRATION_WARN_MS2       4.0f
#define TILT_WARN_DEG            45.0f

// Relay auto control with hysteresis.
#define RELAY_TEMP_ON_C          35.0f
#define RELAY_TEMP_OFF_C         33.0f
#define RELAY_PM25_ON_UG_M3      35.0f
#define RELAY_PM25_OFF_UG_M3     25.0f
#define RELAY_GAS_ON_PPM         450.0f
#define RELAY_GAS_OFF_PPM        350.0f

// =====================================================================
// TELEGRAM
// Keep these values private when publishing the repository.
// =====================================================================
#ifndef TELEGRAM_BOT_TOKEN
#define TELEGRAM_BOT_TOKEN  ""
#endif
#ifndef TELEGRAM_CHAT_ID
#define TELEGRAM_CHAT_ID    ""
#endif
#define TELEGRAM_ALERT_COOLDOWN_MS  30000UL
#define TELEGRAM_RETRY_INTERVAL_MS  3000UL
#define TELEGRAM_TEMP_CHANGE_NOTIFY_C 1.0f
#define TELEGRAM_PM25_CHANGE_NOTIFY_UG_M3 5.0f
#define TELEGRAM_GAS_CHANGE_NOTIFY_PPM 25.0f
#define TELEGRAM_NOISE_CHANGE_NOTIFY_DB 3.0f

#endif // AIRNOISEMONITOR_CONFIG_H
