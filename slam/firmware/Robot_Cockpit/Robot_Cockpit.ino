#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
// Mettre 0 pour les premiers essais moteurs si le LiDAR perturbe le Wi-Fi.
#define ACTIVER_LIDAR 1
#if ACTIVER_LIDAR
#include "ld06.h"
#endif
// ------------------------------------------------------------
// RESEAU WIFI
// ------------------------------------------------------------
const char* WIFI_SSID = "RobotESP32";
const char* WIFI_PASSWORD = "12345678";
WebServer server(80);
// ------------------------------------------------------------
// MOTEURS : branchements testes et valides
// ------------------------------------------------------------
// M1 M2 M3 M4
const uint8_t A[4] = {5, 19, 2, 16};
const uint8_t B[4] = {18, 21, 4, 17};
// Observations : M1/M4 inverses, M2/M3 dans le sens normal.
const int8_t AVANT[4] = {-1, +1, +1, -1};
// Configuration provisoire des positions physiques :
// M1 = avant gauche ; M2 = avant droite ; M3 = arriere gauche ; M4 = arriere droite.
// Les roues gauche reculent et les roues droite avancent pour tourner a gauche.
// Si le robot ne pivote pas correctement, verifier la POSITION des moteurs.
// Motifs exprimes en "sens avant de chaque roue" (+1/-1).
// INDEX : 0 AVANCER ; 1 RECULER ; 2 PIVOTER GAUCHE ; 3 PIVOTER DROITE ;
// 4 GLISSER GAUCHE ; 5 GLISSER DROITE.
const int8_t MOTIFS[6][4] = {
{+1, +1, +1, +1}, // avancer
{-1, -1, -1, -1}, // reculer
{-1, +1, -1, +1}, // tourner gauche sur place
{+1, -1, +1, -1}, // tourner droite sur place
{-1, +1, +1, -1}, // glisser gauche (mecanum)
{+1, -1, -1, +1} // glisser droite (mecanum)
};
const char* NOMS[6] = {
"AVANCER", "RECULER", "TOURNER GAUCHE", "TOURNER DROITE",
"GLISSER GAUCHE", "GLISSER DROITE"
};
// EXACTEMENT le principe du dernier programme qui fonctionne :
// 50 ms d'arret, puis activation M1, M2, M3, M4 a 75 ms d'intervalle,
// encore 75 ms apres M4, puis 300 ms de marche pour les quatre roues.
// Ici, le temps est gere sans bloquer le serveur Web : STOP reste reactif.
const uint32_t PAUSE_INIT_MS = 50;
const uint32_t ECART_MOTEURS_MS = 75;
const uint32_t ENSEMBLE_MS = 300;
enum PhaseMoteurs { ARRET, DEMARRAGE, MAINTIEN };
volatile PhaseMoteurs phase = ARRET;
SemaphoreHandle_t motorMutex;
uint64_t lastSequence=0;
bool resynchroniserLidar=false;
uint8_t scansAIgnorer=0;
uint32_t dernierArretMs=0;
int8_t directions[4] = {0, 0, 0, 0};
uint8_t prochainMoteur = 0;
uint32_t prochaineEtape = 0;
void toutArreter() {
for (int i = 0; i < 4; ++i) {
digitalWrite(A[i], LOW);
digitalWrite(B[i], LOW);
}
phase = ARRET;
dernierArretMs=millis();
}
void moteur(int i, int8_t direction) {
digitalWrite(A[i], LOW);
digitalWrite(B[i], LOW);
if (direction > 0) digitalWrite(A[i], HIGH);
if (direction < 0) digitalWrite(B[i], HIGH);
}
void lancerMouvement(uint8_t type) {
if (type >= 6) return;
toutArreter();
resynchroniserLidar=true; scansAIgnorer=2;
for (int i = 0; i < 4; ++i) {
directions[i] = MOTIFS[type][i] * AVANT[i];
}
prochainMoteur = 0;
prochaineEtape = millis() + PAUSE_INIT_MS;
phase = DEMARRAGE;
Serial.print("COMMANDE : ");
Serial.println(NOMS[type]);
}
void actualiserMoteurs() {
if (phase == ARRET) return;
uint32_t maintenant = millis();
if ((int32_t)(maintenant - prochaineEtape) < 0) return;
if (phase == DEMARRAGE) {
moteur(prochainMoteur, directions[prochainMoteur]);
Serial.printf("M%d : %s HIGH\n", prochainMoteur + 1,
directions[prochainMoteur] > 0 ? "A" : "B");
prochainMoteur++;
if (prochainMoteur < 4) {
prochaineEtape = maintenant + ECART_MOTEURS_MS;
} else {
phase = MAINTIEN;
// Le programme valide attendait aussi 75 ms apres M4.
prochaineEtape = maintenant + ECART_MOTEURS_MS + ENSEMBLE_MS;
}
} else if (phase == MAINTIEN) {
toutArreter();
Serial.println("STOP AUTO - TOUS MOTEURS LOW");
}
}
// ------------------------------------------------------------
// LIDAR LD06 - RX = GPIO 33, PWM = GPIO 32
// ------------------------------------------------------------
#if ACTIVER_LIDAR
const int RX_LIDAR = 33;
const int PWM_LIDAR = 32;
LD06 lidar(Serial2, PWM_LIDAR);
// Format conserve de l'ancien programme :
// octets 0..5 : pose x, y, angle (int16 LE, int16 LE, uint16 LE)
// octets 6..7 : nombre de points (uint16 LE)
// puis 5 octets/point : angle centidegres (uint16 LE),
// distance (uint16 LE), intensite (uint8).
const uint16_t MAX_POINTS = 460;
const size_t MAX_OCTETS = 8 + 5 * MAX_POINTS;
uint8_t scanPublie[MAX_OCTETS] = {0};
size_t tailleScan = 0;
uint16_t nombrePoints = 0;
uint32_t dernierScanMs = 0;
int16_t poseX = 0;
int16_t poseY = 0;
uint16_t poseAngle = 0;
void lireLidar() {
// Priorite aux commandes moteurs pour ne pas prolonger les impulsions.
if (phase != ARRET || uint32_t(millis()-dernierArretMs)<400) return;
if(resynchroniserLidar){while(Serial2.available())Serial2.read();resynchroniserLidar=false;return;}
if(Serial2.available()<47)return;
if (!lidar.readScan()) return;
if(scansAIgnorer){scansAIgnorer--;return;}
uint16_t n = lidar.getNbPointsInScan();
if (n<100 || n > MAX_POINTS) return;
for(uint16_t i=0;i<n;i++){float a=lidar.getPoints(i)->angle;if(!isfinite(a)||a<0||a>=360)return;}
size_t pos = 8;
for (uint16_t i = 0; i < n; ++i) {
const auto* p = lidar.getPoints(i);
uint16_t angle = (uint16_t)(p->angle * 100);
uint16_t distance = p->distance;
scanPublie[pos++] = angle & 0xFF;
scanPublie[pos++] = angle >> 8;
scanPublie[pos++] = distance & 0xFF;
scanPublie[pos++] = distance >> 8;
scanPublie[pos++] = p->intensity;
}
tailleScan = pos;
nombrePoints = n;
dernierScanMs = millis();
}
void envoyerScan() {
if (phase!=ARRET || !tailleScan || uint32_t(millis()-dernierScanMs)>1000 || resynchroniserLidar || scansAIgnorer) {
server.send(503, "text/plain", "NO_VALID_SCAN");
return;
}
// Pose renseignee depuis /pose. Ce n'est pas une localisation calculee.
scanPublie[0] = (uint16_t)poseX & 0xFF;
scanPublie[1] = (uint16_t)poseX >> 8;
scanPublie[2] = (uint16_t)poseY & 0xFF;
scanPublie[3] = (uint16_t)poseY >> 8;
scanPublie[4] = poseAngle & 0xFF;
scanPublie[5] = poseAngle >> 8;
scanPublie[6] = nombrePoints & 0xFF;
scanPublie[7] = nombrePoints >> 8;
server.sendHeader("Access-Control-Allow-Origin", "*");
server.setContentLength(tailleScan);
server.send(200, "application/octet-stream", "");
server.client().write(scanPublie, tailleScan);
}
void reglerPose() {
poseX = (int16_t)constrain(server.arg("x").toInt(), -32768, 32767);
poseY = (int16_t)constrain(server.arg("y").toInt(), -32768, 32767);
int a = server.arg("z").toInt();
poseAngle = (uint16_t)(((a % 36000) + 36000) % 36000);
server.send(200, "text/plain", "OK");
}
#endif
// ------------------------------------------------------------
// PAGE DE PILOTAGE - TOUCHES + BOUTONS
// Un appui lance une impulsion ; maintien = repetition lente.
// ------------------------------------------------------------
const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="fr"><meta charset="utf-8"><title>Robot Cockpit</title><body style="font:18px system-ui;padding:40px"><h1>Robot prêt pour le cockpit</h1><p>Programme : tp3-cockpit-v1.</p><p>Ouvrir le cockpit sur le PC :</p><a href="http://127.0.0.1:8766/slam/cockpit/">Carte, scans et commandes</a><p>Wi-Fi RobotESP32 / 12345678. Aucun mouvement au démarrage.</p></body></html>
)HTML";
bool accepterSequence() {
String seq=server.arg("seq");
if(!seq.length() || seq.length()>16){server.send(400,"text/plain","SEQUENCE_REQUIRED");return false;}
uint64_t value=0;
for(size_t i=0;i<seq.length();i++){if(seq[i]<'0'||seq[i]>'9'){server.send(400,"text/plain","INVALID_SEQUENCE");return false;}value=value*10+seq[i]-'0';}
if(value<=lastSequence){server.send(409,"text/plain","OLD_COMMAND");return false;}
lastSequence=value;return true;
}
void routeMouvement(int index) {
if(!accepterSequence())return;
xSemaphoreTake(motorMutex,portMAX_DELAY);
lancerMouvement(index);
xSemaphoreGive(motorMutex);
server.sendHeader("Access-Control-Allow-Origin", "*");
server.send(200, "text/plain; charset=utf-8", String(NOMS[index]) + " : impulsion lancee");
}
void motorWatchdog(void*){
for(;;){xSemaphoreTake(motorMutex,portMAX_DELAY);actualiserMoteurs();xSemaphoreGive(motorMutex);vTaskDelay(pdMS_TO_TICKS(5));}
}
void setup() {
// Initialiser les sorties avant tout delai ou communication.

// Avant la mise en sortie : aucune commande active.
for (int i = 0; i < 4; ++i) {
digitalWrite(A[i], LOW);
digitalWrite(B[i], LOW);
pinMode(A[i], OUTPUT);
pinMode(B[i], OUTPUT);
}
toutArreter();
Serial.begin(115200);
motorMutex=xSemaphoreCreateMutex();
if(!motorMutex){for(;;){toutArreter();delay(100);}}
if(xTaskCreate(motorWatchdog,"motor-stop",3072,nullptr,3,nullptr)!=pdPASS){for(;;){toutArreter();delay(100);}}
server.enableCORS(true);
server.on("/interface_version",HTTP_GET,[](){server.sendHeader("Cache-Control","no-store");server.send(200,"text/plain","tp3-cockpit-v1");});
Serial.println("MOTEURS : GPIO initialises a LOW");
Serial.println("AVANT : M1/M4 inverses, M2/M3 normaux");
WiFi.mode(WIFI_AP);
bool ok = WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
Serial.println(ok ? "WIFI : OK" : "WIFI : ECHEC");
Serial.print("IP : "); Serial.println(WiFi.softAPIP());
server.on("/", HTTP_GET, [](){server.send_P(200,"text/html; charset=utf-8",PAGE);});
server.on("/ping", HTTP_GET, [](){server.send(200,"text/plain","OK");});
server.on("/forward", HTTP_GET, [](){routeMouvement(0);});
server.on("/backward", HTTP_GET, [](){routeMouvement(1);});
// Fleches gauche/droite = ROTATION (pas glissement lateral).
server.on("/left", HTTP_GET, [](){routeMouvement(2);});
server.on("/right", HTTP_GET, [](){routeMouvement(3);});
server.on("/rotateleft", HTTP_GET, [](){routeMouvement(2);});
server.on("/rotateright", HTTP_GET, [](){routeMouvement(3);});
// Q / E pour le deplacement lateral des roues Mecanum.
server.on("/strafeleft", HTTP_GET, [](){routeMouvement(4);});
server.on("/straferight", HTTP_GET, [](){routeMouvement(5);});
server.on("/stop", HTTP_GET, [](){
if(server.hasArg("seq") && !accepterSequence())return;
xSemaphoreTake(motorMutex,portMAX_DELAY);toutArreter();xSemaphoreGive(motorMutex);
Serial.println("STOP MANUEL");server.send(200,"text/plain","STOP");
});
#if ACTIVER_LIDAR
Serial2.setRxBufferSize(4096);
Serial2.begin(230400, SERIAL_8N1, RX_LIDAR, 26); // TX26 non connecte : GPIO17 sert au moteur.
Serial2.setTimeout(2);
lidar.init();
Serial.println("LIDAR : initialisation demandee sur RX33 / PWM32");
server.on("/scan", HTTP_GET, envoyerScan);
server.on("/pose", HTTP_GET, reglerPose);
server.on("/lidar_status", HTTP_GET, [](){
String s = String("{\"enabled\":true,\"points\":") + nombrePoints +
",\"age_ms\":" + (tailleScan ? String(millis() - dernierScanMs) : String(-1)) + "}";
server.send(200, "application/json", s);
});
#else
server.on("/scan", HTTP_GET, [](){server.send(503,"text/plain","LIDAR_DESACTIVE");});
server.on("/lidar_status", HTTP_GET, [](){server.send(200,"application/json","{\"enabled\":false}");});
#endif
server.onNotFound([](){server.send(404,"text/plain","Route inconnue");});
server.begin();
Serial.println("SERVEUR PRET : http://192.168.4.1");
}
void loop() {
server.handleClient();
// Arret temporise gere independamment par motorWatchdog.
// Si le telephone/PC deconnecte completement du point d'acces,
// stopper immediatement la commande en cours.
// Une deconnexion du navigateur seul reste couverte par STOP AUTO (< 700 ms).
static uint32_t derniereVerifWifi = 0;
if (phase != ARRET && millis() - derniereVerifWifi >= 100) {
derniereVerifWifi = millis();
if (WiFi.softAPgetStationNum() == 0) {
xSemaphoreTake(motorMutex,portMAX_DELAY);toutArreter();xSemaphoreGive(motorMutex);
Serial.println("STOP SECURITE - CLIENT WIFI DECONNECTE");
}
}
#if ACTIVER_LIDAR
lireLidar();
#endif
delay(1);
}