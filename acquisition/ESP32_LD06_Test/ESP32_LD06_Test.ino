// ============================================================================
//  ESP32 LD06 LiDAR Test
//  Demonstration of LD06 usage with the Arduino LD06 library : https://github.com/Robot-Maker-SAS/LD06
//  Author: Jonathan QUILLES (Mike118)
//  Source: https://www.robot-maker.com/shop/capteurs/468-lidar-ld06-468.html
//
//  Tested on Teensy 4.0 (compatible with ESP32, STM32, Arduino Mega, etc.)
//  If memory is insufficient on smaller boards, reduce LD06_MAX_PTS_SCAN in ld06.h
//
//  Need help or want to share your tests? Visit:
//  https://www.robot-maker.com/forum/topic/14388-test-ld06-library/
// ============================================================================

#include "ld06.h"

// Example with hardware serial port (you can replace Serial1 by Serial on Arduino Uno)
#define RX_LIDAR   33
#define TX_LIDAR   -1 // Keep default/current UART TX assignment; leave it unconnected.
// Lidar TX on GPIO33, Lidar PWM on GPIO32.
#define LD06_PWM_PIN 32
#define LIDAR_BAUD 230400
LD06 ld06(Serial2, LD06_PWM_PIN);

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);  // Main serial output (for debug or visualization)

  Serial2.setRxBufferSize(4096);
  Serial2.begin(LIDAR_BAUD, SERIAL_8N1, RX_LIDAR, TX_LIDAR);
  Serial2.setTimeout(10);
  ld06.init(); // Sets GPIO32 HIGH; periodic PWM remains optional below.


  // --------------------------------------------------------------------------
  // OPTIONAL CONFIGURATION ZONES
  // --------------------------------------------------------------------------

  /*
  // --- PWM speed control ---
  #ifdef LD06_PWM_PIN
  analogWriteFrequency(LD06_PWM_PIN, 30000); // PWM frequency: 20–50kHz recommended
  analogWrite(LD06_PWM_PIN, 40);             // Duty cycle (~40%) sets rotation speed
  #endif
  */

  /*
  // --- LiDAR position configuration ---
  ld06.setOffsetPosition(0, 0, 0);   // X, Y offsets (mm) and angular offset (°)
  ld06.setBasePosition(0, 0, 0);     // Position of the moving base if applicable
  ld06.setUpsideDown(true);          // Invert orientation if LiDAR is mounted upside down
  */

  /*
  // --- Data filtering configuration ---
  ld06.enableFiltering();            // Activate filtering
  ld06.setIntensityThreshold(200);   // Filter out low-reflection points (< 200)
  ld06.setDistanceRange(100, 1000);  // Keep points between 0.1–1.0 m
  ld06.setAngleRange(0, 360);        // Keep all points (0–360°)
  // Example for ±10° around 0°: ld06.setAngleRange(350, 10);
  */

  /*
  // --- Other options ---
  ld06.disableCRC();       // Disable CRC check (enabled by default)
  ld06.disableFullScan();  // Stream partial data instead of full 360° scans
  */
}

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
void loop() {

  // If LiDAR is mounted on a moving base, update its position dynamically:
  // ld06.setBasePosition(x, y, angle);

  // Read LiDAR data (returns true when a new full scan is ready)
  if (ld06.readScan()) {
    // --- Recommended real-time visualization ---
    ld06.printScanCSV(Serial);  // Format compatible with https://teleplot.fr/

    /*
    // --- Alternative display and data access examples ---

    // Print scan as CSV for offline logging
    ld06.printScanCSV(Serial);

    // Check if a new 360° loop has been completed
    if (ld06.isNewScan()) {
      Serial.println(F("New scan completed."));
    }

    // Retrieve LiDAR status information
    Serial.print(F("Rotation speed (°/s): "));
    Serial.println(ld06.getSpeed(), 1);

    Serial.print(F("Angle step (°): "));
    Serial.println(ld06.getAngleStep(), 3);

    // Get number of valid points
    uint16_t n = ld06.getNbPointsInScan();
    Serial.print(F("Valid points in scan: "));
    Serial.println(n);

    // Example: access each point
    for (uint16_t i = 0; i < n; i++) {
      const auto* pt = ld06.getPoints(i);
      Serial.print(i);
      Serial.print(F(", angle=")); Serial.print(pt->angle, 2);
      Serial.print(F("°, distance=")); Serial.print(pt->distance);
      Serial.print(F("mm, intensity=")); Serial.print(pt->intensity); Serial.print(F(";"));
    }
    Serial.println("");

    const LD06Packet* packet = ld06.getPreviousPacket();

    if (packet) {
      Serial.println(F("========== LD06 RAW PACKET =========="));
      Serial.print(F("Header: 0x"));
      Serial.println(packet->header, HEX);

      Serial.print(F("Version/Size: 0x"));
      Serial.println(packet->version_size, HEX);

      Serial.print(F("Speed (°/s): "));
      Serial.println(packet->lidarSpeed);
      Serial.print(F("Start angle (0.01°): "));
      Serial.println(packet->startAngle);

      Serial.println(F("---- Measures (distance mm / intensity) ----"));
      for (uint8_t i = 0; i < LD06_PTS_PER_PACKETS; i++) {
        Serial.print(F("[")); Serial.print(i); Serial.print(F("] "));
        Serial.print(packet->measures[i].distance);
        Serial.print(F(" mm, Intensity: "));
        Serial.println(packet->measures[i].intensity);
      }
      Serial.print(F("End angle (0.01°): "));
      Serial.println(packet->endAngle);

      Serial.print(F("Timestamp (ms): "));
      Serial.println(packet->timeStamp);

      Serial.print(F("CRC: 0x"));
      Serial.println(packet->crc, HEX);

      Serial.println(F("===================================="));
      Serial.print(packet->timeStamp);Serial.print(":"); Serial.print(packet->startAngle);Serial.print(","); Serial.println(packet->endAngle);
    }
    */
  }
}
