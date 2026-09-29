#ifndef TELEGRAM_MANAGER_H
#define TELEGRAM_MANAGER_H

#include <Arduino.h>
#include "sensor_manager.h"

class TelegramManager {
public:
    // Gửi cảnh báo kèm thông số cảm biến hiện tại
    bool sendAlert(const SensorData &data);

    // Dùng để kiểm tra bot khi khởi động
    bool sendTestMessage();

private:
    bool sendMessage(const String &message);
};

#endif // TELEGRAM_MANAGER_H