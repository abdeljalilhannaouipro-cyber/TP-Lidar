/* ESP32 / Mecanum Car V2 : commande manuelle, interface intégrée.
   Pilote moteur des ressources du cours, inclus dans ce dossier.
   Aucun mouvement au démarrage. Scan LD06 et commandes dans la même page. */
#include <WiFi.h>
#include <WebServer.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "MecanumCar_v2.h"
#include "interface.h"
#include "ld06.h"

constexpr int MOTOR_SDA = 19, MOTOR_SCL = 21;
constexpr uint32_t LEASE_MS = 400;
constexpr uint16_t MAX_POINTS = LD06_MAX_PTS_SCAN;
LD06 lidar(Serial2, 32);
SemaphoreHandle_t scanMutex;
uint8_t scanPacket[8 + 5 * MAX_POINTS] = {}, scanOutput[8 + 5 * MAX_POINTS];
size_t scanSize = 0;
uint32_t scanAt = 0, scanCount = 0;
uint16_t crcFailures = 0;
bool motorAck = false;
WebServer server(80);
mecanumCar car(MOTOR_SDA, MOTOR_SCL);
SemaphoreHandle_t mutex;
String session;
uint32_t lastSequence = 0, lastCommand = 0, lastStop = 0;
bool moving = false;
String lastAction = "stop";

void stopLocked() { car.Stop(); moving = false; lastAction = "stop"; lastStop = millis(); }
void stopNow() { xSemaphoreTake(mutex, portMAX_DELAY); stopLocked(); xSemaphoreGive(mutex); }
void watchdog(void *) {
  for (;;) {
    xSemaphoreTake(mutex, portMAX_DELAY);
    if ((moving && uint32_t(millis() - lastCommand) >= LEASE_MS) ||
        (!moving && uint32_t(millis() - lastStop) >= 200)) stopLocked();
    xSemaphoreGive(mutex);
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
void reply(int code, const String &body) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json", body);
}
bool number(const String &value, uint32_t &result) {
  if (!value.length() || value.length() > 10) return false;
  uint64_t n = 0;
  for (size_t i = 0; i < value.length(); ++i) {
    if (value[i] < '0' || value[i] > '9') return false;
    n = n * 10 + value[i] - '0'; if (n > UINT32_MAX) return false;
  }
  result = uint32_t(n); return true;
}
void connectClient() {
  stopNow();
  // Adresse 0x30 du pilote fourni. ACK = présence électrique, pas mouvement.
  xSemaphoreTake(mutex, portMAX_DELAY);
  car.IIC_Start(); car.IIC_SendByte(0x30 << 1);
  const bool ack = !car.IIC_RecvACK(); car.IIC_Stop();
  motorAck = ack;
  xSemaphoreGive(mutex);
  session = ""; lastSequence = 0;
  if (ack) session = String(esp_random(), HEX) + String(esp_random(), HEX);
  reply(200, String("{\"firmware\":\"Robot_Lidar_v3\",\"motorAck\":") +
        (ack ? "true" : "false") + ",\"token\":\"" + session + "\"}");
}
void command() {
  if (!session.length() || server.arg("token") != session) {
    reply(409, "{\"error\":\"Session expiree : reconnecter.\"}"); return;
  }
  uint32_t seq, speed;
  if (!number(server.arg("seq"), seq) || seq <= lastSequence) {
    reply(409, "{\"error\":\"Commande ancienne ignoree.\"}"); return;
  }
  lastSequence = seq;
  const String action = server.arg("action");
  if (action == "stop") { stopNow(); reply(200, "{\"ok\":true}"); return; }
  if (!number(server.arg("speed"), speed) || speed < 80 || speed > 160 ||
      (action != "forward" && action != "backward" && action != "left" &&
       action != "right" && action != "rotateleft" && action != "rotateright")) {
    stopNow(); reply(400, "{\"error\":\"Commande ou puissance invalide.\"}"); return;
  }
  xSemaphoreTake(mutex, portMAX_DELAY);
  speed_Upper_L = speed_Lower_L = speed_Upper_R = speed_Lower_R = speed;
  if (action == "forward") car.Advance();
  else if (action == "backward") car.Back();
  else if (action == "left") car.L_Move();
  else if (action == "right") car.R_Move();
  else if (action == "rotateleft") car.Turn_Left();
  else car.Turn_Right();
  lastCommand = millis(); moving = true; lastAction = action;
  xSemaphoreGive(mutex);
  reply(200, "{\"ok\":true}");
}
void publishScan() {
  const uint16_t n = lidar.getNbPointsInScan();
  if (n < 100 || n > MAX_POINTS) return;
  // Valider avant de remplacer le dernier tour publié.
  for (uint16_t i = 0; i < n; ++i) {
    const float angle = lidar.getPoints(i)->angle;
    if (!isfinite(angle) || angle < 0 || angle >= 360) return;
  }
  xSemaphoreTake(scanMutex, portMAX_DELAY);
  scanPacket[6] = uint8_t(n); scanPacket[7] = uint8_t(n >> 8);
  size_t offset = 8;
  for (uint16_t i = 0; i < n; ++i) {
    const auto *point = lidar.getPoints(i);
    const uint16_t angle = uint16_t(point->angle * 100);
    scanPacket[offset++] = uint8_t(angle); scanPacket[offset++] = uint8_t(angle >> 8);
    scanPacket[offset++] = uint8_t(point->distance); scanPacket[offset++] = uint8_t(point->distance >> 8);
    scanPacket[offset++] = point->intensity;
  }
  scanSize = offset; scanAt = millis(); scanCount++;
  xSemaphoreGive(scanMutex);
}
void lidarTask(void *) {
  for (;;) {
    if (lidar.readScan()) publishScan();
    xSemaphoreTake(scanMutex, portMAX_DELAY);
    crcFailures = lidar.getChecksumFailCount();
    xSemaphoreGive(scanMutex);
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}
void sendScan() {
  xSemaphoreTake(scanMutex, portMAX_DELAY);
  const size_t size = scanSize;
  const bool fresh = size && uint32_t(millis() - scanAt) <= 1000;
  if (fresh) memcpy(scanOutput, scanPacket, size);
  xSemaphoreGive(scanMutex);
  if (!fresh) { reply(503, "{\"error\":\"Pas de scan recent : verifier LD06, TX vers GPIO33, alimentation et masse.\"}"); return; }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.setContentLength(size); server.send(200, "application/octet-stream", "");
  server.sendContent(reinterpret_cast<const char *>(scanOutput), size);
}
void sendStatus() {
  xSemaphoreTake(mutex, portMAX_DELAY);
  const bool active = moving;
  const String action = lastAction;
  xSemaphoreGive(mutex);
  xSemaphoreTake(scanMutex, portMAX_DELAY);
  const uint32_t count = scanCount, age = count ? uint32_t(millis() - scanAt) : 0;
  const uint16_t crc = crcFailures;
  xSemaphoreGive(scanMutex);
  String body = "{\"firmware\":\"Robot_Lidar_v3\",\"motorAck\":";
  body += motorAck ? "true" : "false";
  body += ",\"moving\":"; body += active ? "true" : "false";
  body += ",\"action\":\"" + action + "\",\"scans\":"; body += count;
  body += ",\"scanAgeMs\":"; body += age;
  body += ",\"crcErrors\":"; body += crc;
  body += "}"; reply(200, body);
}
void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_SDA, OUTPUT); pinMode(MOTOR_SCL, OUTPUT);
  mutex = xSemaphoreCreateMutex();
  scanMutex = xSemaphoreCreateMutex();
  if (!mutex || !scanMutex) { car.Stop(); while (true) delay(1000); }
  stopNow();
  if (xTaskCreate(watchdog, "motor-stop", 3072, nullptr, 3, nullptr) != pdPASS) {
    stopNow(); while (true) delay(1000);
  }
  Serial2.setRxBufferSize(8192);
  lidar.init();
  // Fixer explicitement la broche après init(), qui appelle begin(baud).
  Serial2.begin(230400, SERIAL_8N1, 33, -1);
  lidar.enableCRC(); lidar.enableFullScan();
  if (xTaskCreate(lidarTask, "lidar", 6144, nullptr, 1, nullptr) != pdPASS) {
    stopNow(); while (true) delay(1000);
  }
  WiFi.mode(WIFI_AP); WiFi.softAP("RobotESP32", "12345678");
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store");
    server.send_P(200, "text/html; charset=utf-8", CONTROL_PAGE);
  });
  server.on("/api/connect", HTTP_GET, connectClient);
  server.on("/api/status", HTTP_GET, sendStatus);
  server.on("/scan", HTTP_GET, sendScan);
  server.on("/api/command", HTTP_GET, command);
  server.on("/api/stop", HTTP_GET, []() {
    session = ""; stopNow(); reply(200, "{\"ok\":true}");
  });
  server.onNotFound([]() { reply(404, "{\"error\":\"Utiliser Robot Lidar v3.\"}"); });
  server.begin();
  Serial.print("Robot Lidar v3 : http://"); Serial.println(WiFi.softAPIP());
}
void loop() {
  server.handleClient();
  if (WiFi.softAPgetStationNum() == 0) { stopNow(); session = ""; }
  delay(1);
}
