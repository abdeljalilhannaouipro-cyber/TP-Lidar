from pathlib import Path
import subprocess, tempfile
root=Path(__file__).resolve().parent
prelude=r'''
#include <string>
#include <map>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <cstring>
#include <cmath>
using std::isfinite;
using std::size_t;
class String: public std::string { public: using std::string::string; String(const std::string&s):std::string(s){} String(uint32_t n,int):std::string(std::to_string(n)){} };
constexpr int SERIAL_8N1=0;constexpr uint16_t LD06_MAX_PTS_SCAN=1200;
constexpr int HEX=16, OUTPUT=1, WIFI_AP=1, HTTP_GET=0, pdPASS=1, portMAX_DELAY=1;
uint32_t clockNow=0;uint32_t millis(){return clockNow;}void pinMode(int,int){}void delay(int){}uint32_t esp_random(){return 123;}
using SemaphoreHandle_t=int;int xSemaphoreCreateMutex(){return 1;}void xSemaphoreTake(int,int){}void xSemaphoreGive(int){}
int pdMS_TO_TICKS(int n){return n;}void vTaskDelay(int){throw 1;}template<class...T>int xTaskCreate(T...){return 1;}
struct SerialT {void begin(int){}template<class T>void print(T){}template<class T>void println(T){} }Serial;
struct Serial2T {void setRxBufferSize(int){}template<class...T>void begin(T...){} } Serial2;
struct Point {float angle=0;uint16_t distance=1000;uint8_t intensity=20;};
struct LD06 {Point points[1200];uint16_t n=100;LD06(Serial2T&,int){}void init(){}void enableCRC(){}void enableFullScan(){}bool readScan(){return false;}uint16_t getNbPointsInScan(){return n;}Point*getPoints(int i){return &points[i];}uint16_t getChecksumFailCount(){return 0;} };
struct WifiT {void mode(int){}void softAP(const char*,const char*){}int softAPgetStationNum(){return 1;}String softAPIP(){return "192.168.4.1";} }WiFi;
struct WebServer {std::map<std::string,String>args;int code=0;String body;WebServer(int){}String arg(const char*k){return args[k];}template<class...T>void sendHeader(T...){}void send(int c,const char*,const String&b){code=c;body=b;}template<class...T>void send_P(T...){}template<class...T>void on(T...){}template<class T>void onNotFound(T){}void begin(){}void handleClient(){}void setContentLength(size_t){}void sendContent(const char*,size_t){} };
uint8_t speed_Upper_L,speed_Lower_L,speed_Upper_R,speed_Lower_R;
struct mecanumCar {bool ack=true;std::string action="stop";mecanumCar(int,int){}void Stop(){action="stop";}void Advance(){action="forward";}void Back(){action="backward";}void L_Move(){action="left";}void R_Move(){action="right";}void Turn_Left(){action="rotateleft";}void Turn_Right(){action="rotateright";}void IIC_Start(){}void IIC_Stop(){}void IIC_SendByte(int){}bool IIC_RecvACK(){return !ack;} };
const char CONTROL_PAGE[]="";
'''
source='\n'.join(l for l in (root/'firmware/Robot_Clavier/Robot_Clavier.ino').read_text(encoding='utf-8').splitlines() if not l.startswith('#include'))
tests=r'''
void request(const char*action,const char*seq,const char*speed="80") {server.args={{"token",session},{"action",action},{"seq",seq},{"speed",speed}}; command();}
void watchdogTick(){try{watchdog(nullptr);}catch(int){}}
int main(){
 setup();assert(!moving && car.action=="stop");
 car.ack=false;connectClient();assert(server.code==200 && session.empty());
 car.ack=true;connectClient();assert(server.code==200 && !session.empty());
 for(auto action:{"forward","backward","left","right","rotateleft","rotateright"}){request(action,std::to_string(lastSequence+1).c_str());assert(server.code==200 && car.action==action && moving);}
 request("stop","7");assert(!moving && car.action=="stop");
 request("forward","6");assert(server.code==409 && !moving); // ancien mouvement après STOP
 request("forward","8","999");assert(server.code==400 && !moving);
 request("forward","9");assert(moving);clockNow=399;watchdogTick();assert(moving);
 clockNow=400;watchdogTick();assert(!moving && car.action=="stop");
 request("forward","10");clockNow=700;request("forward","11");clockNow=1000;watchdogTick();assert(moving);
 clockNow=1100;watchdogTick();assert(!moving); // bail renouvelé au dernier heartbeat
 server.args["token"]="wrong";server.args["seq"]="12";command();assert(server.code==409 && !moving);
 publishScan();assert(scanCount==1 && scanSize==508);sendScan();assert(server.code==200);clockNow+=1001;sendScan();assert(server.code==503);
 lidar.points[0].angle=400;publishScan();assert(scanCount==1);
 uint32_t n;assert(!number("-1",n));assert(!number("4294967296",n));assert(!number("80x",n));
 std::cout<<"PASS firmware : demarrage immobile, ACK carte, 6 directions, STOP, requetes anciennes, PWM invalide, watchdog 400 ms, heartbeat, session.\n";
}
'''
with tempfile.TemporaryDirectory(prefix='robot-test-') as tmp:
 p=Path(tmp);(p/'test.cpp').write_text(prelude+source+tests,encoding='utf-8')
 subprocess.run(['g++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test.exe')],check=True)
 subprocess.run([str(p/'test.exe')],check=True)
