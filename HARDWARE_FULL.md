# AirNoiseMonitor Full – phần cứng và chân kết nối

## 1. Sơ đồ chân ESP32

| Thành phần | Chân ESP32 | Giao tiếp |
|---|---:|---|
| DHT22 | GPIO4 | Digital |
| OLED SSD1306 SDA | GPIO21 | I2C |
| OLED SSD1306 SCL | GPIO22 | I2C |
| MPU6050 SDA | GPIO21 | I2C dùng chung OLED |
| MPU6050 SCL | GPIO22 | I2C dùng chung OLED |
| PIR OUT | GPIO27 | Digital |
| PM2.5 mô phỏng | GPIO32 | ADC1 |
| Solar/LDR | GPIO33 | ADC1 |
| Gas MQ2/MQ135 AO | GPIO34 | ADC1, input-only |
| Noise AO | GPIO35 | ADC1, input-only |
| NeoPixel Matrix DIN | GPIO5 | WS2812 |
| Relay IN | GPIO23 | Digital output |
| PMS5003 TX → ESP32 RX2 | GPIO16 | UART2, cấu hình ESP32 thật |
| PMS5003 RX ← ESP32 TX2 | GPIO17 | UART2, thường không cần |
| LED tích hợp | GPIO2 | Trạng thái |

Các ngõ analog đều đặt trên ADC1 để không xung đột với WiFi.

## 2. Hai cấu hình build

### Wokwi

```bash
pio run -e wokwi
```

- PM2.5: biến trở tại GPIO32, quy đổi 0–500 µg/m³.
- Noise: biến trở tại GPIO35, quy đổi 30–100 dB tương đối.
- Solar: module LDR tại GPIO33 để mô phỏng cường độ nắng.
- Bluetooth và OTA tắt trong profile mô phỏng.
- Cấu hình WiFi có thể thử bằng Serial Monitor:

```text
WIFI:Wokwi-GUEST|
WIFI?
WIFI:CLEAR
```

### ESP32 thật

```bash
pio run -e esp32-real
pio run -e esp32-real -t upload
```

- PM2.5: PMS5003 UART2, 9600 baud.
- Noise: microphone analog, lấy biên độ peak-to-peak.
- Solar: đo điện áp tấm pin qua cầu chia áp vào GPIO33; hệ số mặc định là 2.0.
- Bluetooth Serial bật để nhận cấu hình WiFi.
- OTA bật với hostname `airnoise-monitor`.
- WiFi được lưu trong Preferences và tự kết nối lại.

## 3. Cấu hình WiFi bằng Bluetooth

Ghép đôi điện thoại/máy tính với:

```text
AirNoiseMonitor-Setup
```

Mở ứng dụng Bluetooth Serial và gửi:

```text
WIFI:TEN_WIFI|MAT_KHAU
```

Các lệnh khác:

```text
WIFI?       # xem SSID, trạng thái, IP
WIFI:CLEAR  # xóa WiFi đã lưu và quay về WiFi mặc định
```

## 4. OTA

OTA chỉ bật trong môi trường `esp32-real`.

- Hostname: `airnoise-monitor.local`
- Password: `airnoise-ota`
- Máy tính và ESP32 cần cùng mạng WiFi.
- Lần nạp đầu tiên vẫn phải qua USB; các lần sau có thể OTA.

## 5. Relay tự động

Relay bật khi một trong các điều kiện xảy ra:

- Nhiệt độ ≥ 35°C.
- PM2.5 ≥ 35 µg/m³.
- Gas ≥ 450 ppm tương đối.

Relay chỉ tắt khi cả ba thông số giảm xuống dưới ngưỡng hysteresis để tránh bật/tắt liên tục.

## 6. NeoPixel Matrix

- Đỏ: có cảnh báo.
- Xanh dương: PIR phát hiện chuyển động.
- Vàng: mất WiFi.
- Xanh lá: hệ thống bình thường.
- Điểm trắng chạy: heartbeat cho biết firmware còn hoạt động.

## 7. Lưu ý mạch thật

- NeoPixel Matrix và relay nên dùng nguồn 5V riêng đủ dòng, nối chung GND với ESP32.
- Không nối trực tiếp tấm pin mặt trời có điện áp trên 3.3V vào GPIO33. Dùng cầu chia áp; mặc định code giả định hai điện trở bằng nhau, hệ số 2.0.
- `solarPowerW` hiện là công suất ước tính theo điện áp. Muốn đo công suất thật, cần thêm cảm biến dòng/điện áp như INA219.
- MQ2/MQ135 thường dùng 5V; điện áp AO phải được giới hạn/chia áp về tối đa 3.3V trước khi vào ESP32.
- PM2.5 Wokwi chỉ là mô phỏng analog; profile thật đã chuẩn bị UART cho PMS5003.
- Các giá trị gas và noise cần hiệu chuẩn nếu dùng ngoài mục đích demo.
