from pathlib import Path
import subprocess,tempfile
src=(Path(__file__).resolve().parent/'firmware/Robot_Cockpit/Robot_Cockpit.ino').read_text(encoding='utf-8')
motor=src[src.index('const uint8_t A[4]'):src.index('// LIDAR LD06 - RX')]
seq=src[src.index('bool accepterSequence()'):src.index('void routeMouvement')]
stub=r'''
#include <cstdint>
#include <string>
#include <map>
#include <cassert>
#include <iostream>
using std::size_t;using String=std::string;using SemaphoreHandle_t=int;
constexpr int LOW=0,HIGH=1;int gpio[40]={};uint32_t tick=0;uint32_t millis(){return tick;}void digitalWrite(int p,int v){gpio[p]=v;}
struct SerialT{template<class T>void print(T){}template<class T>void println(T){}template<class...T>void printf(T...){} }Serial;
struct ServerT{std::map<String,String> args;int status=0;String arg(const char*k){return args[k];}void send(int n,const char*,const char*){status=n;}}server;
'''
tests=r'''
void zeros(){for(int i=0;i<4;i++)assert(gpio[A[i]]==0&&gpio[B[i]]==0);}
int main(){
 assert(A[0]==5&&B[0]==18&&A[1]==19&&B[1]==21&&A[2]==2&&B[2]==4&&A[3]==16&&B[3]==17);
 toutArreter();zeros();
 for(int mode=0;mode<6;mode++){
  tick=0;lancerMouvement(mode);zeros();
  for(int t=0;t<=650;t+=5){tick=t;actualiserMoteurs();for(int i=0;i<4;i++){
   const bool running=t>=50+75*i&&t<650;int d=MOTIFS[mode][i]*AVANT[i];
   assert(gpio[A[i]]==(running&&d>0));assert(gpio[B[i]]==(running&&d<0));assert(!(gpio[A[i]]&&gpio[B[i]]));
  }}assert(phase==ARRET);zeros();
 }
 tick=0;lancerMouvement(0);tick=50;actualiserMoteurs();toutArreter();tick=500;actualiserMoteurs();zeros();
 server.args["seq"]="100";assert(accepterSequence());server.args["seq"]="99";assert(!accepterSequence()&&server.status==409);server.args["seq"]="100";assert(!accepterSequence());server.args["seq"]="101";assert(accepterSequence());server.args["seq"]="-1";assert(!accepterSequence());server.args["seq"]="";assert(!accepterSequence());
 std::cout<<"PASS moteur cockpit : brochage fourni, 6 motifs, 4 moteurs, demarrage etage, arret 650 ms, STOP pendant demarrage, commandes anciennes refusees.\n";
}
'''
with tempfile.TemporaryDirectory(prefix='cockpit-motor-') as tmp:
 p=Path(tmp);(p/'test.cpp').write_text(stub+motor+seq+tests,encoding='utf-8');subprocess.run(['g++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test.exe')],check=True);subprocess.run([str(p/'test.exe')],check=True)
