#ifndef FIREBASE_MANAGER_H
#define FIREBASE_MANAGER_H

#include <Arduino.h>
#include "sensor_manager.h"

class FirebaseManager {
public:
    void begin();
    bool pushLatest(const SensorData &data);
    bool pushHistory(const SensorData &data);

private:
    String buildJsonPayload(const SensorData &data);
};

#endif
