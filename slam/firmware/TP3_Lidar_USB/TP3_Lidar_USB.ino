/* TP3 : acquisition LD06 USB pour localisation + cartographie sur le PC.
   Moteurs maintenus a zero. Aucun pilotage ni mouvement automatique.
   Firmware adapte au cablage direct confirme sur les photos.
   GPIO26 utilise comme TX UART non connecte, afin de ne pas affecter GPIO17 moteur.
*/
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "ld06.h"
const uint8_t MOTOR_PINS[] = {15,2,4,16,17,5,18,19};
constexpr uint16_t MAX_POINTS = 1000;
LD06 lidar(Serial2,32);
SemaphoreHandle_t scanMutex;
DataPoint latest[MAX_POINTS], output[MAX_POINTS];
uint16_t count = 0;
uint32_t sequence = 0, publishedAt = 0;
void stopMotors() { for(uint8_t pin:MOTOR_PINS) digitalWrite(pin,LOW); }
void acquire(void*) {
  for(;;) {
    if(lidar.readScan()) {
      const uint16_t n=lidar.getNbPointsInScan();
      if(n>=100 && n<=MAX_POINTS) {
        xSemaphoreTake(scanMutex,portMAX_DELAY);
        for(uint16_t i=0;i<n;i++) latest[i]=*lidar.getPoints(i);
        count=n; sequence++; publishedAt=millis();
        xSemaphoreGive(scanMutex);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}
void setup() {
  for(uint8_t pin:MOTOR_PINS){ digitalWrite(pin,LOW); pinMode(pin,OUTPUT); }
  stopMotors(); Serial.begin(115200);
  scanMutex=xSemaphoreCreateMutex();
  if(!scanMutex) { for(;;){stopMotors();delay(100);} }
  Serial2.setRxBufferSize(8192);
  Serial2.begin(230400,SERIAL_8N1,33,26);
  lidar.init(); // begin(baud) conserve ici les broches deja affectees.
  lidar.enableCRC(); lidar.enableFullScan();
  if(xTaskCreate(acquire,"lidar",6144,nullptr,1,nullptr)!=pdPASS){for(;;){stopMotors();delay(100);}}
  Serial.println("# TP3_Lidar_USB_v1 - moteurs a zero - CSV 115200 bauds");
}
void loop() {
  stopMotors();
  static uint32_t sent=0,lastSend=0,lastNotice=0;
  const uint32_t now=millis();
  if(uint32_t(now-lastSend)>=1500) {
    xSemaphoreTake(scanMutex,portMAX_DELAY);
    const uint32_t seq=sequence;
    const uint16_t n=count;
    const bool fresh=n && uint32_t(now-publishedAt)<=1000 && seq!=sent;
    if(fresh) for(uint16_t i=0;i<n;i++) output[i]=latest[i];
    xSemaphoreGive(scanMutex);
    if(fresh) {
      lastSend=now;sent=seq;
      Serial.println("point_index,angle_deg,dist_mm,intensity");
      for(uint16_t i=0;i<n;i++) {
        Serial.print(i); Serial.print(','); Serial.print(output[i].angle,2); Serial.print(',');
        Serial.print(output[i].distance); Serial.print(','); Serial.println(output[i].intensity);
      }
      Serial.println();
    } else if(uint32_t(now-lastNotice)>=3000){
      lastNotice=now;Serial.println("# Pas de nouveau tour valide : verifier alimentation LD06 et TX vers GPIO33.");
    }
  }
  delay(2);
}
