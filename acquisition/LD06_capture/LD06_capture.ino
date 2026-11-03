// Acquisition CSV pour le TP. Dépendance : bibliothèque LD06 Robot-Maker.
// Adapté aux broches du montage ESP32 fourni par l'étudiant.
#include "ld06.h"
LD06 lidar(Serial2, 32);

void setup() {
  Serial.begin(115200);
  Serial2.setRxBufferSize(4096);
  Serial2.begin(230400, SERIAL_8N1, 33, -1);
  Serial2.setTimeout(10);
  lidar.init();
}

void loop() {
  if (!lidar.readScan()) return;
  Serial.println("BEGIN_SCAN");
  Serial.println("point_index,angle_deg,dist_mm,intensity");
  for (uint16_t i = 0; i < lidar.getNbPointsInScan(); ++i) {
    const auto* p = lidar.getPoints(i);
    Serial.print(i); Serial.print(',');
    Serial.print(p->angle, 2); Serial.print(',');
    Serial.print(p->distance); Serial.print(',');
    Serial.println(p->intensity);
  }
  Serial.println("END_SCAN");
  // Limite le débit USB pour ne pas saturer la liaison à 115200 bauds.
  delay(250);
}
