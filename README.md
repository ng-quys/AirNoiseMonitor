# AirNoiseMonitor Full

Hệ thống IoT giám sát môi trường dùng ESP32, hoạt động với cả Wokwi và phần cứng thật.

## Thành phần đã tích hợp

- OLED SSD1306 128×64.
- DHT22: nhiệt độ và độ ẩm.
- PIR: phát hiện chuyển động.
- MPU6050: gia tốc, con quay, độ nghiêng và rung.
- PM2.5/PM10: biến trở mô phỏng trong Wokwi hoặc PMS5003 UART trên mạch thật.
- Gas: MQ2/MQ135 analog và AQI tương đối.
- Noise: mức analog tương đối hoặc peak-to-peak microphone.
- Solar: LDR mô phỏng cường độ nắng trong Wokwi; profile thật đọc điện áp tấm pin qua cầu chia áp.
- NeoPixel Matrix 8×8: hiển thị trạng thái hệ thống.
- Relay: tự động bật quạt/tải khi nhiệt độ, PM2.5 hoặc gas vượt ngưỡng.
- Firebase Realtime Database: latest + history.
- Telegram: cảnh báo môi trường.
- Bluetooth Serial: cấu hình WiFi trên ESP32 thật.
- Preferences: lưu SSID/mật khẩu vào flash.
- Auto reconnect WiFi.
- ArduinoOTA trên ESP32 thật.
- Dashboard responsive hiển thị toàn bộ cảm biến và trạng thái hạ tầng.

## Chạy Wokwi

1. Mở thư mục project bằng VS Code + PlatformIO.
2. Build profile mặc định:

```bash
pio run -e wokwi
```

3. Start Wokwi Simulator.
4. Các điều khiển mô phỏng:
   - DHT22: bấm cảm biến và đổi nhiệt độ/độ ẩm.
   - PIR: bấm `Simulate Motion`.
   - MPU6050: chỉnh gia tốc/rotation trong popup.
   - PM2.5: xoay biến trở `PM2.5 simulator`.
   - Gas: chỉnh ppm của MQ2.
   - Noise: xoay biến trở noise.
   - Solar: chỉnh lux của LDR.

## Chạy ESP32 thật

```bash
pio run -e esp32-real
pio run -e esp32-real -t upload
```

Chi tiết chân, Bluetooth WiFi và OTA xem [HARDWARE_FULL.md](HARDWARE_FULL.md).

## Dashboard

Mở `data/index.html` bằng Live Server. Website sử dụng Firebase REST Stream để nhận `airnoise/latest`, polling 1 giây làm dự phòng và đọc `airnoise/history` cho biểu đồ/CSV.

Dữ liệu mở rộng gồm:

- `pm25UgM3`, `pm10UgM3`
- `gasPpm`, `airQualityIndex`
- `pirMotion`
- `tiltDeg`, `vibrationMs2`, gia tốc và gyro 3 trục
- `solarLux`, `solarPercent`, `solarVoltage`, `solarPowerW`
- `relayOn`
- `wifiConnected`, `wifiRssi`, `wifiSsid`
- `otaReady`, `bluetoothProvisioning`, `firmwareVersion`

## Bảo mật và cấu hình secret

Các thông tin nhạy cảm không còn được đặt trực tiếp trong `include/config.h`.

1. Sao chép file mẫu:

```bash
cp include/secrets.example.h include/secrets.h
```

Trên Windows PowerShell:

```powershell
Copy-Item include/secrets.example.h include/secrets.h
```

2. Mở `include/secrets.h` và điền WiFi, Firebase Auth (nếu dùng), OTA password, Telegram Bot Token và Telegram Chat ID của bạn.

3. `include/secrets.h` đã nằm trong `.gitignore`, vì vậy **không commit file này lên GitHub**.

> `config.h` có giá trị fallback an toàn để project vẫn build khi chưa có `secrets.h`; khi đó Telegram/Firebase Auth/OTA password sẽ không có credential riêng.



