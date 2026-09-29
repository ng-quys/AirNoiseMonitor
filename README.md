
# 🌿 AirNoiseMonitor

### Urban Air Quality & Noise Monitoring System

**An ESP32-based IoT system for real-time environmental monitoring,
Firebase data logging, alerts, and web visualization.**

![ESP32](https://img.shields.io/badge/ESP32-IoT-000000?logo=espressif)
![PlatformIO](https://img.shields.io/badge/PlatformIO-ESP32-orange?logo=platformio)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20Database-FFCA28?logo=firebase&logoColor=black)
![Wokwi](https://img.shields.io/badge/Wokwi-Simulation-6C4AB6)
![License](https://img.shields.io/badge/License-Educational-lightgrey)

**[Overview](#-overview) • [Features](#-features) •
[Architecture](#️-system-architecture) • [Getting
Started](#-getting-started) • [Dashboard](#-web-dashboard) •
[Roadmap](#️-roadmap)**
:::

------------------------------------------------------------------------

## 📖 Overview

**AirNoiseMonitor** is an IoT project for monitoring urban air quality
and noise levels in real time.

The system uses an **ESP32 DevKit V1** to collect environmental data
from a **DHT22**, **MQ135**, and **KY-037/KY-038**. The ESP32 processes
the readings, evaluates configured warning thresholds, and sends the
latest measurements and historical records to **Firebase Realtime
Database** over WiFi.

A web dashboard reads the Firebase data and presents current values,
alert states, and historical charts.

> **Project topic:** Hệ thống giám sát chất lượng không khí và tiếng ồn
> đô thị\
> **Domain:** Smart Cities / Internet of Things (IoT)

------------------------------------------------------------------------

## ✨ Features

-   🌡️ Real-time temperature monitoring
-   💧 Real-time humidity monitoring
-   🌫️ Relative air-quality monitoring using MQ135
-   🔊 Estimated environmental noise monitoring
-   ☁️ Upload latest readings to Firebase Realtime Database
-   🕒 Store timestamped historical measurements
-   📊 Web dashboard with current environmental values
-   📈 Historical visualization using Chart.js
-   🚨 Threshold-based environmental alerts
-   💡 ESP32 status LED indication
-   🔄 Automatic WiFi reconnection
-   🧪 Wokwi simulation support
-   📴 ESP32 continues operating locally when WiFi is unavailable

------------------------------------------------------------------------

## 🏗️ System Architecture

``` text
┌───────────────────────────────────────────┐
│              SENSOR LAYER                 │
│                                           │
│     DHT22       MQ135       KY-037/038    │
│  Temp/Humidity  Air Quality     Noise     │
└────────┬──────────┬──────────────┬─────────┘
         │          │              │
         └──────────┼──────────────┘
                    ▼
           ┌─────────────────┐
           │      ESP32      │
           │  Data Processing│
           │ Alert Evaluation│
           └────────┬────────┘
                    │ WiFi / HTTPS
                    ▼
       ┌─────────────────────────┐
       │ Firebase Realtime       │
       │ Database                │
       │                         │
       │ /airnoise/latest        │
       │ /airnoise/history       │
       └────────────┬────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Web Dashboard  │
           │ Values • Alerts │
           │     Charts      │
           └─────────────────┘
```

### Data flow

1.  Sensors provide environmental measurements to the ESP32.
2.  ESP32 samples and processes the sensor data.
3.  Alert flags are generated when configured thresholds are exceeded.
4.  The latest snapshot is uploaded to `/airnoise/latest`.
5.  Historical samples are appended to `/airnoise/history`.
6.  The dashboard retrieves Firebase data and updates the interface and
    charts.

------------------------------------------------------------------------

## 🔧 Hardware

  Component          Purpose
  ------------------ ---------------------------------------------------
  ESP32 DevKit V1    Main controller, processing and WiFi connectivity
  DHT22              Temperature and humidity
  MQ135              Relative air-quality measurement
  KY-037 / KY-038    Environmental sound-level input
  ESP32 status LED   Local operating/alert indication

> The MQ135 air-quality index and sound-level values in the current
> implementation are **approximate/relative values and are not
> calibrated measurements**.

------------------------------------------------------------------------

## 💻 Tech Stack

  Layer             Technology
  ----------------- ----------------------------
  Microcontroller   ESP32 DevKit V1
  Firmware          C++ / Arduino Framework
  Development       PlatformIO
  Connectivity      WiFi + HTTPS REST
  Database          Firebase Realtime Database
  Frontend          HTML, CSS, JavaScript
  Charts            Chart.js
  Simulation        Wokwi

The firmware communicates with Firebase through HTTPS REST requests
instead of requiring a Firebase SDK.

------------------------------------------------------------------------

## 📁 Project Structure

``` text
AirNoiseMonitor/
├── data/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── ui-enhancements.js
│
├── include/
│   ├── config.h
│   ├── firebase_manager.h
│   ├── sensor_manager.h
│   └── wifi_manager.h
│
├── src/
│   ├── main.cpp
│   ├── firebase_manager.cpp
│   ├── sensor_manager.cpp
│   └── wifi_manager.cpp
│
├── .vscode/
├── .gitignore
├── diagram.json
├── platformio.ini
├── wokwi.toml
└── README.md
```

### Main modules

  -----------------------------------------------------------------------
  Module                              Responsibility
  ----------------------------------- -----------------------------------
  `main.cpp`                          Main application loop and task
                                      coordination

  `sensor_manager.*`                  Sensor initialization, sampling and
                                      alert evaluation

  `wifi_manager.*`                    WiFi connection and reconnection

  `firebase_manager.*`                Firebase REST communication and
                                      data upload

  `config.h`                          WiFi, Firebase, pins, intervals and
                                      alert thresholds

  `data/`                             Web dashboard source files
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 🚀 Getting Started

### Prerequisites

Install the following tools:

-   [Git](https://git-scm.com/)
-   [Visual Studio Code](https://code.visualstudio.com/)
-   [PlatformIO IDE](https://platformio.org/)
-   [Wokwi for VS Code](https://wokwi.com/)

### 1. Clone the repository

``` bash
git clone https://github.com/YOUR_USERNAME/AirNoiseMonitor.git
cd AirNoiseMonitor
```

Replace `YOUR_USERNAME` with the GitHub account that hosts this
repository.

### 2. Configure the project

Open:

``` text
include/config.h
```

For Wokwi, the default network can remain:

``` cpp
#define WIFI_SSID       "Wokwi-GUEST"
#define WIFI_PASSWORD   ""
```

Configure your Firebase Realtime Database host:

``` cpp
#define FIREBASE_HOST   "your-project-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH   ""
```

The firmware currently uses:

``` text
/airnoise/latest
/airnoise/history
```

for the latest sensor snapshot and historical records.

### 3. Build

Using the PlatformIO CLI:

``` bash
pio run
```

Or use:

``` text
PlatformIO → Project Tasks → esp32dev → Build
```

### 4. Run the Wokwi simulation

Open the project in VS Code and start the Wokwi simulator. The
simulation configuration is provided by:

``` text
diagram.json
wokwi.toml
```

Open the Serial Monitor at:

``` text
115200 baud
```

The ESP32 prints sensor values, alert states, and Firebase upload
results to the serial console.

------------------------------------------------------------------------

## ☁️ Firebase Realtime Database

The firmware sends two types of records.

### Latest reading

``` text
/airnoise/latest
```

Contains the newest sensor snapshot for real-time dashboard display.

### Historical data

``` text
/airnoise/history
```

Stores timestamped readings used by the dashboard to build historical
charts.

The dashboard currently loads up to the latest **20 historical data
points** for visualization.

> For a classroom/demo environment, Firebase test rules may be
> convenient. For a public or production deployment, secure the database
> rules and authentication before publishing the system.

------------------------------------------------------------------------

## 📊 Web Dashboard

Dashboard source files are located in:

``` text
data/
```

The dashboard displays:

-   Temperature
-   Humidity
-   Relative AQI-like value
-   Estimated noise level
-   Firebase connection status
-   Environmental warning states
-   Historical temperature/humidity chart
-   Historical air-quality/noise chart

The dashboard obtains both current and historical measurements directly
from Firebase.

### Run locally

You can open `data/index.html` using a local web server such as the
**Live Server** extension in VS Code.

``` text
data/index.html
```

> If the dashboard is deployed publicly, make sure its Firebase
> configuration and database rules are appropriate for public access.

------------------------------------------------------------------------

## 🚨 Alert Thresholds

Current thresholds are configured in `include/config.h`:

  Parameter                   Warning / High   Danger
  ------------------------- ---------------- --------
  Temperature                          35 °C      ---
  Humidity                               85%      ---
  Relative AQI-like index                150      300
  Estimated noise                      70 dB    85 dB

These values can be changed in:

``` cpp
#define TEMP_HIGH_C           35.0f
#define HUMIDITY_HIGH_PCT     85.0f
#define MQ135_AQI_WARN        150
#define MQ135_AQI_DANGER      300
#define NOISE_WARN_DB         70.0f
#define NOISE_DANGER_DB       85.0f
```

> These thresholds are part of the current project configuration. The
> MQ135-derived index and noise values should not be treated as
> certified environmental measurements without calibration.

------------------------------------------------------------------------

## ⚙️ Timing Configuration

The current firmware uses:

``` cpp
#define SENSOR_READ_INTERVAL_MS  3000UL
#define UPLOAD_INTERVAL_MS       5000UL
#define SOUND_SAMPLE_WINDOW_MS   50UL
```

This means the ESP32:

-   samples sensor data every **3 seconds**
-   attempts a Firebase upload every **5 seconds**
-   uses a **50 ms** sound sampling window

------------------------------------------------------------------------

## 📸 Screenshots

Add project screenshots to `docs/images/` and replace the placeholders
below.

### Web Dashboard

``` md
![Web Dashboard](docs/images/dashboard.png)
```

### Wokwi Simulation

``` md
![Wokwi Simulation](docs/images/wokwi.png)
```

### System Architecture

``` md
![System Architecture](docs/images/architecture.png)
```

Recommended repository structure:

``` text
docs/
└── images/
    ├── dashboard.png
    ├── wokwi.png
    └── architecture.png
```

------------------------------------------------------------------------

## 🔐 Security

**Never commit real credentials to a public repository.**

Do not publish:

-   WiFi passwords
-   Firebase authentication tokens
-   Firebase service-account private keys
-   API keys
-   Bot tokens
-   Webhook secrets
-   Other private credentials

For real hardware deployment, move credentials into a local secrets file
and exclude it using `.gitignore`.

Example:

``` gitignore
# PlatformIO
.pio/

# Local secrets
.env
secrets.h
firebase-key.json
serviceAccountKey.json

# IDE / OS
.vscode/.browse.c_cpp.db*
.vscode/c_cpp_properties.json
.vscode/launch.json
.vscode/ipch
.DS_Store
Thumbs.db
```

------------------------------------------------------------------------

## 🗺️ Roadmap

Possible future improvements:

-   [ ] Calibrate the MQ135 using reference measurements
-   [ ] Calibrate the noise sensor against a sound-level meter
-   [ ] Test the system on physical hardware in outdoor conditions
-   [ ] Improve Firebase authentication and security rules
-   [ ] Add long-term environmental statistics
-   [ ] Add configurable thresholds from the dashboard
-   [ ] Add data export for environmental analysis
-   [ ] Improve mobile dashboard responsiveness
-   [ ] Add additional environmental sensors

------------------------------------------------------------------------

## 👥 Contributors

  Member
  ---------------------
  Đàm Như Quỳnh
  Hồ Ngọc Quý
  Trần Ngọc Minh Trân
  Lê Văn Nguyên Bình

**Group 14 --- Topic 24**

------------------------------------------------------------------------

## 🤝 Contributing

This repository is primarily developed as an academic IoT project.

For team development:

1.  Create a new branch.
2.  Make and test your changes.
3.  Commit with a clear message.
4.  Push the branch to GitHub.
5.  Open a Pull Request before merging into `main`.

Example:

``` bash
git checkout -b feature/dashboard-improvement
git add .
git commit -m "feat: improve dashboard"
git push -u origin feature/dashboard-improvement
```

------------------------------------------------------------------------

## 📄 License

This project is currently intended for **educational and academic use**.

If the repository will be released for reuse by others, add a standard
open-source license such as the **MIT License** and replace this section
accordingly.

------------------------------------------------------------------------

## ⚠️ Disclaimer

AirNoiseMonitor is currently an educational IoT project and simulation
prototype.

Air-quality and sound-level values produced by the current
sensor-processing logic are approximate and have not been calibrated
against certified environmental monitoring equipment. The project should
therefore not be used as an official environmental measurement or safety
system.

------------------------------------------------------------------------


**AirNoiseMonitor · Smart Cities · IoT**

Built with ESP32, Firebase and Web technologies.

