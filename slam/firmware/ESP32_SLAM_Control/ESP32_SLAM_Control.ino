/*
 * TP3 - ESP32 + Keyestudio Mecanum Car V2 + LD06
 * Adapte des ressources de Jonathan Quilles (2026).
 * Aucun mouvement automatique au demarrage.
 * Compatible avec slam/controle.html et les paquets /scan du cours.
 * WiFi et WebServer sont inclus dans le paquet ESP32 pour Arduino.
 */
#include <WiFi.h>
#include <WebServer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "ld06.h"
#include "MecanumCar_v2.h"

constexpr int MOTOR_SDA = 19;
constexpr int MOTOR_SCL = 21;
constexpr int LIDAR_RX = 33;
constexpr int LIDAR_PWM = 32;
constexpr uint32_t LIDAR_BAUD = 230400;
constexpr uint32_t MAX_MOVE_MS = 300;
constexpr uint32_t PERMISSION_MS = 30000;
constexpr uint8_t MOTOR_PWM = 60;  // Commande 0..255, pas une vitesse en m/s.

const char *WIFI_NAME = "RobotESP32";
const char *WIFI_PASSWORD = "12345678";
WebServer server(80);
mecanumCar car(MOTOR_SDA, MOTOR_SCL);
LD06 lidar(Serial2, LIDAR_PWM);

SemaphoreHandle_t motorMutex = nullptr;
bool moving = false;
bool stopWasRequested = false;
uint32_t moveStarted = 0;
uint32_t moveDuration = 0;
uint32_t permissionStarted = 0;
uint32_t lastIdleStop = 0;

constexpr uint16_t MAX_POINTS = 460;
uint8_t scanPacket[8 + 5 * MAX_POINTS];
size_t scanSize = 0;
uint32_t scanPublishedAt = 0;
uint16_t rawPointCount = 0;
int16_t displayX = 0, displayY = 0;
uint16_t displayAngle = 0;

void stopMotors(bool grantPermission) {
  xSemaphoreTake(motorMutex, portMAX_DELAY);
  car.Stop();
  moving = false;
  stopWasRequested = grantPermission;
  permissionStarted = millis();
  lastIdleStop = millis();
  xSemaphoreGive(motorMutex);
}

// Ce delai ne depend pas de la progression des requetes HTTP ou du lidar.
// Cela reste un arret logiciel : garder une coupure electrique accessible.
void motorWatchdog(void *) {
  for (;;) {
    const uint32_t now = millis();
    xSemaphoreTake(motorMutex, portMAX_DELAY);
    if (moving && uint32_t(now - moveStarted) >= moveDuration) {
      car.Stop();
      moving = false;
      lastIdleStop = now;
    }
    if (stopWasRequested && uint32_t(now - permissionStarted) >= PERMISSION_MS) {
      stopWasRequested = false;
      car.Stop();
      moving = false;
      lastIdleStop = now;
    }
    // Renouveler le zero si l'alimentation de la carte moteur arrive plus tard.
    if (!moving && uint32_t(now - lastIdleStop) >= 100) {
      car.Stop();
      lastIdleStop = now;
    }
    xSemaphoreGive(motorMutex);
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void headers() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Cache-Control", "no-store");
}

void textResponse(int code, const char *text) {
  headers();
  server.send(code, "text/plain", text);
}

bool integerArg(const char *name, long minValue, long maxValue, long &value) {
  if (!server.hasArg(name)) return false;
  const String text = server.arg(name);
  if (!text.length() || text.length() > 11) return false;
  size_t i = (text[0] == '-') ? 1 : 0;
  if (i == text.length()) return false;
  for (; i < text.length(); ++i) if (text[i] < '0' || text[i] > '9') return false;
  char *end = nullptr;
  const long parsed = strtol(text.c_str(), &end, 10);
  if (*end != '\0' || parsed < minValue || parsed > maxValue) return false;
  value = parsed;
  return true;
}

void movement(const char *action) {
  long requested = 100;
  if (server.hasArg("time") && !integerArg("time", 50, MAX_MOVE_MS, requested)) {
    stopMotors(false);
    textResponse(400, "TIME_MUST_BE_50_TO_300_MS");
    return;
  }
  xSemaphoreTake(motorMutex, portMAX_DELAY);
  if (!stopWasRequested || uint32_t(millis() - permissionStarted) >= PERMISSION_MS) {
    car.Stop();
    moving = false;
    stopWasRequested = false;
    xSemaphoreGive(motorMutex);
    textResponse(409, "STOP_FIRST");
    return;
  }
  if (moving) {
    xSemaphoreGive(motorMutex);
    textResponse(409, "MOVEMENT_IN_PROGRESS");
    return;
  }
  moveDuration = uint32_t(requested);
  if (!strcmp(action, "forward")) car.Advance();
  else if (!strcmp(action, "backward")) car.Back();
  else if (!strcmp(action, "left")) car.L_Move();
  else if (!strcmp(action, "right")) car.R_Move();
  else if (!strcmp(action, "rotateleft")) { car.Turn_Left(); moveDuration /= 2; }
  else if (!strcmp(action, "rotateright")) { car.Turn_Right(); moveDuration /= 2; }
  else {
    car.Stop();
    xSemaphoreGive(motorMutex);
    textResponse(400, "UNKNOWN_MOVEMENT");
    return;
  }
  moveStarted = millis();
  moving = true;
  xSemaphoreGive(motorMutex);
  textResponse(200, "OK");
}

void publishScan() {
  const uint16_t n = lidar.getNbPointsInScan();
  rawPointCount = n;
  // Pas de troncature silencieuse d'un tour trop long.
  if (n < 100 || n > MAX_POINTS) { scanSize = 0; return; }
  size_t offset = 8;
  scanPacket[6] = uint8_t(n);
  scanPacket[7] = uint8_t(n >> 8);
  for (uint16_t i = 0; i < n; ++i) {
    const auto *p = lidar.getPoints(i);
    if (!isfinite(p->angle) || p->angle < 0 || p->angle >= 360) { scanSize = 0; return; }
    const uint16_t a = uint16_t(p->angle * 100);
    scanPacket[offset++] = uint8_t(a);
    scanPacket[offset++] = uint8_t(a >> 8);
    scanPacket[offset++] = uint8_t(p->distance);
    scanPacket[offset++] = uint8_t(p->distance >> 8);
    scanPacket[offset++] = p->intensity;
  }
  scanSize = offset;
  scanPublishedAt = millis();
}

void sendScan() {
  if (!scanSize || uint32_t(millis() - scanPublishedAt) > 1000) {
    textResponse(503, "NO_FRESH_VALID_SCAN");
    return;
  }
  // Cette pose est une valeur d'affichage, PAS une odometrie.
  scanPacket[0] = uint8_t(displayX); scanPacket[1] = uint8_t(uint16_t(displayX) >> 8);
  scanPacket[2] = uint8_t(displayY); scanPacket[3] = uint8_t(uint16_t(displayY) >> 8);
  scanPacket[4] = uint8_t(displayAngle); scanPacket[5] = uint8_t(displayAngle >> 8);
  headers();
  server.setContentLength(scanSize);
  server.send(200, "application/octet-stream", "");
  server.sendContent(reinterpret_cast<const char *>(scanPacket), scanSize);
}

void setup() {
  // Aucune sequence d'avance / recul : STOP est le premier ordre moteur.
  car.Stop();
  Serial.begin(115200);
  motorMutex = xSemaphoreCreateMutex();
  if (!motorMutex) { car.Stop(); for (;;) delay(1000); }
  speed_Upper_L = speed_Lower_L = speed_Upper_R = speed_Lower_R = MOTOR_PWM;
  stopMotors(false);
  if (xTaskCreate(motorWatchdog, "motor-stop", 3072, nullptr, 3, nullptr) != pdPASS) {
    car.Stop();
    for (;;) delay(1000);
  }
  Serial2.setRxBufferSize(4096);
  Serial2.begin(LIDAR_BAUD, SERIAL_8N1, LIDAR_RX, -1);
  Serial2.setTimeout(2);
  lidar.init();

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(WIFI_NAME, WIFI_PASSWORD)) {
    stopMotors(false);
    Serial.println("Echec Wi-Fi : moteurs arretes.");
    for (;;) delay(1000);
  }
  server.on("/", HTTP_GET, []() { textResponse(200, "ESP32_SLAM_Control - STOP au demarrage. Utiliser /stop puis la commande manuelle."); });
  server.on("/ping", HTTP_GET, []() { textResponse(200, "OK"); });
  server.on("/stop", HTTP_GET, []() { stopMotors(true); textResponse(200, "STOPPED"); });
  server.on("/forward", HTTP_GET, []() { movement("forward"); });
  server.on("/backward", HTTP_GET, []() { movement("backward"); });
  server.on("/left", HTTP_GET, []() { movement("left"); });
  server.on("/right", HTTP_GET, []() { movement("right"); });
  server.on("/rotateleft", HTTP_GET, []() { movement("rotateleft"); });
  server.on("/rotateright", HTTP_GET, []() { movement("rotateright"); });
  server.on("/scan", HTTP_GET, sendScan);
  server.on("/pose", HTTP_GET, []() {
    long x, y, a;
    if (!integerArg("x", -32768, 32767, x) || !integerArg("y", -32768, 32767, y) || !integerArg("z", -36000, 36000, a)) {
      textResponse(400, "INVALID_DISPLAY_POSE"); return;
    }
    displayX = int16_t(x); displayY = int16_t(y); displayAngle = uint16_t((a % 36000 + 36000) % 36000);
    textResponse(200, "OK");
  });
  server.on("/status", HTTP_GET, []() {
    xSemaphoreTake(motorMutex, portMAX_DELAY);
    const bool active = moving, permitted = stopWasRequested;
    xSemaphoreGive(motorMutex);
    String body = "{\"firmware\":\"ESP32_SLAM_Control\",\"moving\":";
    body += active ? "true" : "false";
    body += ",\"stopRequested\":"; body += permitted ? "true" : "false";
    body += ",\"rawScanPoints\":"; body += rawPointCount;
    body += ",\"maxMovementMs\":300}";
    headers(); server.send(200, "application/json", body);
  });
  server.onNotFound([]() { if (server.method() == HTTP_OPTIONS) { headers(); server.send(204); } else textResponse(404, "NOT_FOUND"); });
  server.begin();
  Serial.println("Moteurs arretes. Aucune exploration automatique activee.");
  Serial.print("WiFi : "); Serial.println(WIFI_NAME);
  Serial.print("Adresse : http://"); Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
  if (lidar.readScan()) publishScan();
  // Deconnexion du dernier client : arret et nouvelle verification /stop requise.
  static uint32_t checkedAt = 0;
  if (uint32_t(millis() - checkedAt) >= 100) {
    checkedAt = millis();
    if (WiFi.softAPgetStationNum() == 0) stopMotors(false);
  }
  delay(1);
}
