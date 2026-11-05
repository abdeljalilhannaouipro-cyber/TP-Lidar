#include <WiFi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "ld06.h"
#include "MecanumCar_v2.h"

// ============================================================
// WIFI AP
// ============================================================
const char* ssid = "RobotESP32";
const char* password = "12345678";
AsyncWebServer server(80);

// ROBOT POSE
int16_t posex = 0;
int16_t posey = 0;
uint16_t posez = 0;

// ============================================================
// LIDAR LD06
// ============================================================
#define RX_LIDAR 33
#define TX_LIDAR -1 // Keep default/current UART TX assignment; leave it unconnected.
#define LD06_PWM_PIN 32
#define LIDAR_BAUD 230400
LD06 lidar(Serial2, LD06_PWM_PIN);

// ============================================================
// OUTILS HTTP
// ============================================================
int getArg(AsyncWebServerRequest* req, const char* name, int def) {
  return req->hasParam(name) ? req->getParam(name)->value().toInt() : def;
}

void addCORS(AsyncWebServerResponse* resp) {
  resp->addHeader("Access-Control-Allow-Origin", "*");
  resp->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  resp->addHeader("Access-Control-Allow-Headers", "*");
}

// ============================================================
// MOTEURS
// ============================================================
bool moving = false;
uint32_t moveStarted = 0;
uint32_t moveDuration = 0;
SemaphoreHandle_t motorMutex;
const int MAX_MOVE_MS = 2000;

mecanumCar mecanumCar(19, 21);

void stopRobot() {
  xSemaphoreTake(motorMutex, portMAX_DELAY);
  mecanumCar.Stop();
  moving = false;
  xSemaphoreGive(motorMutex);
}

void doMove(void (*fn)(), int t) {
  xSemaphoreTake(motorMutex, portMAX_DELAY);
  if (t <= 0) {
    mecanumCar.Stop();
    moving = false;
  } else {
    moveDuration = (uint32_t)constrain(t, 1, MAX_MOVE_MS);
    moveStarted = millis();
    fn();
    moving = true;
  }
  xSemaphoreGive(motorMutex);
}

void forward(int t)     { doMove([](){ mecanumCar.Advance(); }, t); }
void backward(int t)    { doMove([](){ mecanumCar.Back(); }, t); }
void left(int t)        { doMove([](){ mecanumCar.L_Move(); }, t); }
void right(int t)       { doMove([](){ mecanumCar.R_Move(); }, t); }
void rotateleft(int t)  { doMove([](){ mecanumCar.Turn_Left(); }, t/2); }
void rotateright(int t) { doMove([](){ mecanumCar.Turn_Right(); }, t/2); }

// ============================================================
// SEND SCAN
// ============================================================
const uint16_t MAX_SCAN_POINTS = 460;
const size_t MAX_SCAN_BYTES = 8 + 5 * MAX_SCAN_POINTS;
uint8_t publishedScan[MAX_SCAN_BYTES];
size_t publishedSize = 0;
portMUX_TYPE scanMux = portMUX_INITIALIZER_UNLOCKED;

void publishScan() {
  const uint16_t n = lidar.getNbPointsInScan();
  if (n == 0 || n > MAX_SCAN_POINTS) return;
  uint8_t snapshot[MAX_SCAN_BYTES];
  snapshot[6] = n & 0xff;
  snapshot[7] = n >> 8;
  size_t off = 8;
  for (uint16_t i = 0; i < n; ++i) {
    const auto* pt = lidar.getPoints(i);
    const uint16_t angle = (uint16_t)(pt->angle * 100);
    snapshot[off++] = angle & 0xff;
    snapshot[off++] = angle >> 8;
    snapshot[off++] = pt->distance & 0xff;
    snapshot[off++] = pt->distance >> 8;
    snapshot[off++] = pt->intensity;
  }
  portENTER_CRITICAL(&scanMux);
  memcpy(publishedScan + 6, snapshot + 6, off - 6);
  publishedSize = off;
  portEXIT_CRITICAL(&scanMux);
}

void sendScanBinary(AsyncWebServerRequest* req) {
  uint8_t snapshot[MAX_SCAN_BYTES];
  size_t size;
  portENTER_CRITICAL(&scanMux);
  size = publishedSize;
  memcpy(snapshot, publishedScan, size);
  snapshot[0] = posex & 0xff; snapshot[1] = (uint16_t)posex >> 8;
  snapshot[2] = posey & 0xff; snapshot[3] = (uint16_t)posey >> 8;
  snapshot[4] = posez & 0xff; snapshot[5] = posez >> 8;
  portEXIT_CRITICAL(&scanMux);
  if (!size) {
    auto response = req->beginResponse(503, "text/plain", "NO_VALID_SCAN");
    addCORS(response); req->send(response);
    return;
  }
  auto response = req->beginResponseStream("application/octet-stream");
  response->write(snapshot, size);
  addCORS(response);
  req->send(response);
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  motorMutex = xSemaphoreCreateMutex();
  if (!motorMutex) { while (true) delay(1000); }
  stopRobot();

  // LIDAR UART
  Serial2.setRxBufferSize(1024);
  Serial2.begin(LIDAR_BAUD, SERIAL_8N1, RX_LIDAR, TX_LIDAR);
  Serial2.setTimeout(2);
  lidar.init(); // Sets the Lidar PWM input on GPIO32 HIGH (no periodic PWM).

  // WIFI AP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password);
  delay(200);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  // ROUTES
  server.on("/stop", HTTP_GET, [](AsyncWebServerRequest* r){
    stopRobot();
    auto response = r->beginResponse(200, "text/plain", "STOPPED");
    addCORS(response); r->send(response);
  });
  server.on("/forward", HTTP_GET, [](AsyncWebServerRequest* r){
    forward(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/backward", HTTP_GET, [](AsyncWebServerRequest* r){
    backward(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/left", HTTP_GET, [](AsyncWebServerRequest* r){
    left(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/right", HTTP_GET, [](AsyncWebServerRequest* r){
    right(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/rotateleft", HTTP_GET, [](AsyncWebServerRequest* r){
    rotateleft(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/rotateright", HTTP_GET, [](AsyncWebServerRequest* r){
    rotateright(getArg(r,"time",300));
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/scan", HTTP_GET, [](AsyncWebServerRequest* r){
    sendScanBinary(r);
  });

  server.on("/pose", HTTP_GET, [](AsyncWebServerRequest* r){
    const int xPose = constrain(getArg(r,"x",0), -32768, 32767);
    const int yPose = constrain(getArg(r,"y",0), -32768, 32767);
    const int angle = getArg(r,"z",0);
    portENTER_CRITICAL(&scanMux);
    posex = xPose;
    posey = yPose;
    posez = ((angle % 36000) + 36000) % 36000;
    portEXIT_CRITICAL(&scanMux);
    auto x = r->beginResponse(200,"text/plain","OK");
    addCORS(x); r->send(x);
  });

  server.on("/ping", HTTP_GET, [](AsyncWebServerRequest *r){
    r->send(200,"text/plain","OK");
  });

  server.begin();
}

// ============================================================
// LOOP
// ============================================================
void loop() {

  // Lire le lidar régulièrement
  if (lidar.readScan()) publishScan();

  // Laisser respirer la pile WiFi
  static uint32_t lastYield = 0;
  if (millis() - lastYield > 20) {
    lastYield = millis();
    yield();
  }

  // Arrêt auto des moteurs
  xSemaphoreTake(motorMutex, portMAX_DELAY);
  if (moving && (uint32_t)(millis() - moveStarted) >= moveDuration) {
    mecanumCar.Stop();
    moving = false;
  }
  xSemaphoreGive(motorMutex);
}
