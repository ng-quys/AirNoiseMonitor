#ifndef OUTPUT_MANAGER_H
#define OUTPUT_MANAGER_H

#include <Arduino.h>
#include "sensor_manager.h"

class OutputManager {
public:
    void begin();
    void update(SensorData &data);
    bool relayState() const;

private:
    bool relayOn = false;
    unsigned long lastDisplayPageChange = 0;
    unsigned long lastDisplayRefresh = 0;
    unsigned long lastMatrixRefresh = 0;
    uint8_t displayPage = 0;

    void updateRelay(const SensorData &data);
    void updateMatrix(const SensorData &data);
    void updateDisplay(const SensorData &data);
    void setRelay(bool enabled);
};

#endif
