// Genre Police AutoVJ host by LBN. Uses VJVision's Music Battery engine by ichiryu.
// Music Battery (ChargeBar) engine by ichiryu, from VJVision
// (https://github.com/ichiryu0021/VJVision), MIT License.
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>
#include <sqlite3.h>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>
#include "capture.h"
#include "audio/resampler.h"
#include "live-match.h"
#include "engine/charge_engine.h"
#include "util/audio_file.h"
#include "util/tags.h"
#include "util/path_util.h"
using namespace vj;
using Microsoft::WRL::ComPtr;
namespace fs=std::filesystem;
std::atomic<bool> running{true};
std::mutex stdoutMutex;
std::string q(const std::string& s) {
  std::string out="\"";
  for(unsigned char c:s) { if(c=='"'||c=='\\') { out+='\\'; out+=c; }
    else if(c<32) { char b[7]; snprintf(b,sizeof(b),"\\u%04x",c); out+=b; } else out+=c; }
  return out+'"';
}
void event(const std::string& s) { std::lock_guard<std::mutex> l(stdoutMutex); std::cout<<s<<std::endl; }
void check(HRESULT h,const char* label) { if(FAILED(h)) throw std::runtime_error(std::string(label)+" ("+std::to_string((unsigned long)h)+")"); }
void sql(sqlite3* db,const char* command) { char* err=nullptr; if(sqlite3_exec(db,command,nullptr,nullptr,&err)!=SQLITE_OK) { std::string s=err?err:"SQLite error"; sqlite3_free(err); throw std::runtime_error(s); } }
struct Db { sqlite3* p=nullptr; Db(const std::string& file,int flags=SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE) { if(sqlite3_open_v2(file.c_str(),&p,flags,nullptr)!=SQLITE_OK) throw std::runtime_error("Cannot open fingerprint database"); sqlite3_busy_timeout(p,10000); } ~Db(){if(p)sqlite3_close(p);} };
void compatible(const std::string& file) {
  if(!fs::exists(pathutil::fromUtf8(file))) return;
  Db d(file,SQLITE_OPEN_READONLY); sqlite3_stmt* s=nullptr;
  if(sqlite3_prepare_v2(d.p,"PRAGMA user_version",-1,&s,nullptr)!=SQLITE_OK) throw std::runtime_error("Unreadable fingerprint database");
  int v=sqlite3_step(s)==SQLITE_ROW?sqlite3_column_int(s,0):-1; sqlite3_finalize(s);
  if(v!=0&&v!=fp_params::FP_SCHEMA_VERSION) throw std::runtime_error("Fingerprint version incompatible. Original index retained; re-analyze in Prepare mode.");
}
#include "pcm-collector.h"
#include "aiff.h"
#include "file-fingerprint.h"
LoadedAudio decode(const std::wstring& name,const std::wstring& pcmFile=L"") {
  // Media Foundation handles PCM WAV, AAC/M4A and installed Windows decoders.
  // VJVision's vendored decoders remain the fallback for FLAC/MP3.
  try {
    ComPtr<IMFSourceReader> reader; check(MFCreateSourceReaderFromURL(name.c_str(),nullptr,&reader),"Open audio");
    check(reader->SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS,FALSE),"Select audio");
    check(reader->SetStreamSelection(MF_SOURCE_READER_FIRST_AUDIO_STREAM,TRUE),"Select audio stream");
    ComPtr<IMFMediaType> type; check(MFCreateMediaType(&type),"Create PCM format");
    type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Audio); type->SetGUID(MF_MT_SUBTYPE,MFAudioFormat_PCM);
    type->SetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE,16);
    check(reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM,nullptr,type.Get()),"Decode PCM");
    ComPtr<IMFMediaType> actual; check(reader->GetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM,&actual),"PCM format");
    UINT32 rate=0,channels=0,bits=0;
    actual->GetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND,&rate); actual->GetUINT32(MF_MT_AUDIO_NUM_CHANNELS,&channels); actual->GetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE,&bits);
    if(bits!=16||rate<8000||channels<1||channels>32) throw std::runtime_error("Unsupported PCM format");
    std::vector<float> mono, resampled; MonoResampler resampler; resampler.reset(rate);
    PcmCollector out(pcmFile);
    while(running) {
      DWORD flags=0; ComPtr<IMFSample> sample;
      check(reader->ReadSample(MF_SOURCE_READER_FIRST_AUDIO_STREAM,0,nullptr,&flags,nullptr,&sample),"Read audio");
      if(flags&MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED) throw std::runtime_error("Audio format changed inside file");
      if(sample) {
        ComPtr<IMFMediaBuffer> buffer; check(sample->ConvertToContiguousBuffer(&buffer),"Read PCM buffer");
        BYTE* data=nullptr; DWORD length=0; check(buffer->Lock(&data,nullptr,&length),"Lock PCM");
        size_t frames=length/(2*channels); mono.resize(frames); const auto* pcm=reinterpret_cast<const int16_t*>(data);
        for(size_t i=0;i<frames;++i) { double sum=0; for(UINT32 c=0;c<channels;++c) sum+=pcm[i*channels+c]; mono[i]=(float)(sum/(channels*32768.0)); }
        buffer->Unlock(); resampled.clear(); resampler.process(mono.data(),mono.size(),resampled);
        out.append(resampled);
      }
      if(flags&MF_SOURCE_READERF_ENDOFSTREAM) break;
    }
    return out.finish();
  } catch(const std::exception& e) {
    if(std::string(e.what()).find("90 minute")!=std::string::npos||std::string(e.what()).find("Cannot save temporary PCM")!=std::string::npos)throw;
    auto ext=fs::path(name).extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),::towlower);
    if(ext==L".aif"||ext==L".aiff"||ext==L".aifc")return decodeAiff(name,pcmFile);
    auto audio=loadAudioFile(pathutil::toUtf8(fs::path(name)));
    if(audio.monoSamples.size()>44100ULL*60*90)throw std::runtime_error("Individual track exceeds 90 minute analysis limit");
    if(!pcmFile.empty()){std::ofstream stream(fs::path(pcmFile),std::ios::binary|std::ios::trunc);stream.write((const char*)audio.monoSamples.data(),audio.monoSamples.size()*2);stream.close();if(!stream)throw std::runtime_error("Cannot save temporary PCM");audio.monoSamples.clear();}
    return audio;
  }
}
class PcmWriter {
  std::wstring name; std::thread worker; std::mutex mutex; std::condition_variable cv;
  std::deque<std::vector<float>> queue; std::atomic<bool> alive{true}; HANDLE handle=INVALID_HANDLE_VALUE;
public:
  PcmWriter(std::wstring n):name(std::move(n)){worker=std::thread([this]{run();});}
  void push(const float* f,size_t n) { if(!n||n>44100) return; std::lock_guard<std::mutex> l(mutex); if(queue.size()>=8)queue.pop_front(); queue.emplace_back(f,f+n); cv.notify_one(); }
  void run() {
    uint32_t seq=0;
    while(alive) {
      if(handle==INVALID_HANDLE_VALUE) { handle=CreateFileW(name.c_str(),GENERIC_WRITE,0,nullptr,OPEN_EXISTING,0,nullptr); if(handle==INVALID_HANDLE_VALUE){Sleep(100);continue;} }
      std::vector<float> data;
      {std::unique_lock<std::mutex> l(mutex);cv.wait_for(l,std::chrono::milliseconds(100),[&]{return !queue.empty()||!alive;});if(!alive)break;if(queue.empty())continue;data=std::move(queue.front());queue.pop_front();}
      uint32_t header[4]={0x47504156,(uint32_t)data.size(),44100,seq++};
      std::vector<char> packet(sizeof(header)+data.size()*sizeof(float)); memcpy(packet.data(),header,sizeof(header));memcpy(packet.data()+sizeof(header),data.data(),data.size()*sizeof(float));
      DWORD written=0;
      if(!WriteFile(handle,packet.data(),(DWORD)packet.size(),&written,nullptr)||written!=packet.size()){CloseHandle(handle);handle=INVALID_HANDLE_VALUE;}
    }
    if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);
  }
  ~PcmWriter(){alive=false;cv.notify_all();if(worker.joinable()){CancelSynchronousIo(worker.native_handle());worker.join();}}
};
void prepare(const std::wstring& file,const std::string& database,const std::string& uid,const std::wstring& pcmFile) {
  compatible(database); FpDb init; if(!init.open(database))throw std::runtime_error("Cannot initialize database");init.close();
  event("{\"type\":\"progress\",\"phase\":\"decode\"}"); decode(file,pcmFile);
  const auto sampleCount=fs::file_size(fs::path(pcmFile))/2;
  event("{\"type\":\"progress\",\"phase\":\"fingerprint\"}");
  auto hashes=autovj::fingerprintFile(fs::path(pcmFile));
  if(hashes.empty()) throw std::runtime_error("No usable fingerprint peaks in this file");
  Db d(database); sql(d.p,"PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  sqlite3_stmt* find=nullptr; sqlite3_prepare_v2(d.p,"SELECT song_id FROM songs WHERE song_name=?",-1,&find,nullptr);sqlite3_bind_text(find,1,uid.c_str(),-1,SQLITE_TRANSIENT);
  int id=sqlite3_step(find)==SQLITE_ROW?sqlite3_column_int(find,0):-1;sqlite3_finalize(find);
  if(id>=0){sql(d.p,("DELETE FROM fingerprints WHERE song_id="+std::to_string(id)).c_str());}
  else {sqlite3_stmt* insert=nullptr;sqlite3_prepare_v2(d.p,"INSERT INTO songs(song_name,total_hashes,fingerprinted) VALUES(?,?,1)",-1,&insert,nullptr);sqlite3_bind_text(insert,1,uid.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(insert,2,(int)hashes.size());if(sqlite3_step(insert)!=SQLITE_DONE){sqlite3_finalize(insert);throw std::runtime_error("Cannot store track");}sqlite3_finalize(insert);id=(int)sqlite3_last_insert_rowid(d.p);}
  sqlite3_stmt* add=nullptr;sqlite3_prepare_v2(d.p,"INSERT OR IGNORE INTO fingerprints(song_id,hash,offset) VALUES(?,?,?)",-1,&add,nullptr);
  for(const auto& h:hashes){sqlite3_bind_int(add,1,id);sqlite3_bind_text(add,2,h.hash.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(add,3,h.offset);if(sqlite3_step(add)!=SQLITE_DONE){sqlite3_finalize(add);throw std::runtime_error("Fingerprint write failed");}sqlite3_reset(add);}sqlite3_finalize(add);
  sql(d.p,("UPDATE songs SET total_hashes="+std::to_string(hashes.size())+", fingerprinted=1 WHERE song_id="+std::to_string(id)).c_str());
  sql(d.p,"COMMIT");
  event("{\"type\":\"prepared\",\"trackUid\":"+q(uid)+",\"songId\":"+std::to_string(id)+",\"hashes\":"+std::to_string(hashes.size())+",\"durationMs\":"+std::to_string(sampleCount*1000/44100)+"}");
}
void snapshot(const std::string& file,const std::string& target) { compatible(file); Db from(file,SQLITE_OPEN_READONLY),to(target);auto* backup=sqlite3_backup_init(to.p,"main",from.p,"main");if(!backup)throw std::runtime_error("Backup failed");int result=sqlite3_backup_step(backup,-1);sqlite3_backup_finish(backup);if(result!=SQLITE_DONE)throw std::runtime_error("Incomplete backup");event("{\"type\":\"done\"}"); }
void removeTracks(const std::string& database,const std::vector<std::string>& ids){
  compatible(database);Db d(database);sql(d.p,"PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  for (const auto& uid : ids) {
  sqlite3_stmt* s=nullptr;sqlite3_prepare_v2(d.p,"DELETE FROM fingerprints WHERE song_id IN (SELECT song_id FROM songs WHERE song_name=?)",-1,&s,nullptr);sqlite3_bind_text(s,1,uid.c_str(),-1,SQLITE_TRANSIENT);if(sqlite3_step(s)!=SQLITE_DONE){sqlite3_finalize(s);throw std::runtime_error("Cannot remove fingerprints");}sqlite3_finalize(s);
  sqlite3_prepare_v2(d.p,"DELETE FROM songs WHERE song_name=?",-1,&s,nullptr);sqlite3_bind_text(s,1,uid.c_str(),-1,SQLITE_TRANSIENT);if(sqlite3_step(s)!=SQLITE_DONE){sqlite3_finalize(s);throw std::runtime_error("Cannot remove track");}sqlite3_finalize(s);
  }
  sql(d.p,"COMMIT");event("{\"type\":\"done\"}");
}
void replay(const std::wstring& file,const std::string& database){
  compatible(database);FpDb db;if(!db.open(database))throw std::runtime_error("Cannot open fingerprint database");
  auto input=decode(file);RingBuffer ring(44100*18);ChargeBarEngine engine;int transitionTickIdx=0;size_t at=0;
  while(at<input.monoSamples.size()){
    const size_t end=(std::min)(input.monoSamples.size(),at+(engine.transitionActive()?22050:88200));
    std::vector<float> samples(end-at);float peak=0;for(size_t i=at;i<end;i++){samples[i-at]=input.monoSamples[i]/32768.f;peak=(std::max)(peak,std::abs(samples[i-at]));}ring.write(samples.data(),samples.size());at=end;
    const double seconds=(double)at/44100;FpResult result;if(peak>1e-4f)result=autovj::matchLive(db,ring,peak,engine.transitionActive(),transitionTickIdx,seconds);
    auto tick=engine.tick(result,seconds);if(tick.event==MatchEvent::Confirmed)event("{\"type\":\"confirmed\",\"trackUid\":"+q(db.getSong(tick.songId).songName)+",\"at\":"+std::to_string(seconds)+"}");
  }
  event("{\"type\":\"done\"}");
}
void listen(const std::string& database,const std::wstring& device,const std::wstring& pipe,int channel) {
  compatible(database); FpDb db; if(!db.open(database))throw std::runtime_error("Cannot open fingerprint database");
  PcmWriter audio(pipe); RingBuffer ring(44100*18); WasapiCapture capture; capture.channelStart=channel;capture.onAudio=[&](const float* p,size_t n){audio.push(p,n);};capture.openEndpoint(device);capture.start(&ring);
  ChargeBarEngine engine;auto start=std::chrono::steady_clock::now(),next=start,lastSignal=start,lastEvidence=start;int transitionTickIdx=0; bool hadSignal=false,lastLost=false,stale=false;
  std::thread([]{std::string line;while(std::getline(std::cin,line)){if(line=="stop")break;}running=false;}).detach();
  event("{\"type\":\"ready\",\"protocol\":1}");
  while(running){Sleep(15);auto now=std::chrono::steady_clock::now();double seconds=std::chrono::duration<double>(now-start).count();
    bool lost=capture.deviceLost();if(lost!=lastLost){lastLost=lost;engine.reset();ring.clear();event(std::string("{\"type\":\"device\",\"lost\":")+(lost?"true":"false")+"}");}
    if(now<next)continue;bool transition=engine.transitionActive();next=now+std::chrono::milliseconds(transition?500:2000);
    if(lost)continue;float peak=capture.peakLevel();event("{\"type\":\"level\",\"peak\":"+std::to_string(peak)+",\"rms\":"+std::to_string(capture.rmsLevel())+"}");
    FpResult result;
    if(peak>=1e-4f){lastSignal=now;hadSignal=true;result=autovj::matchLive(db,ring,peak,transition,transitionTickIdx,seconds);}
    else if(hadSignal&&now-lastSignal>std::chrono::seconds(10)){engine.reset();ring.clear();hadSignal=false;event("{\"type\":\"standby\"}");}
    auto tick=engine.tick(result,seconds);const char* names[]={"none","no-match","noise","tentative","mix-hold","confirmed"};
    if(result.matched&&result.songId==engine.currentSongId()&&tick.curVotes>=10){lastEvidence=now;stale=false;}
    std::string uid=tick.songId>=0?db.getSong(tick.songId).songName:"";
    if(tick.event==MatchEvent::Confirmed){lastEvidence=now;stale=false;}
    if(engine.currentSongId()>=0&&now-lastEvidence>std::chrono::seconds(30)&&!stale){stale=true;engine.reset();ring.clear();event("{\"type\":\"stale\"}");continue;}
    event("{\"type\":\"match\",\"event\":"+q(names[(int)tick.event])+",\"trackUid\":"+q(uid)+",\"confidence\":"+std::to_string(tick.confidence)+",\"currentCharge\":"+std::to_string(tick.curVotes)+",\"candidateCharge\":"+std::to_string(tick.streakVotes)+",\"at\":"+std::to_string(seconds)+"}");
  }capture.stop();
}
int wmain(int argc,wchar_t** argv) {
  CoInitializeEx(nullptr,COINIT_MULTITHREADED);MFStartup(MF_VERSION);
  try {
    auto arg=[&](int i){if(i>=argc)throw std::runtime_error("Missing argument");return pathutil::toUtf8(fs::path(argv[i]));};
    if(argc<2)throw std::runtime_error("Expected --devices, --prepare, --listen or --snapshot");std::string mode=arg(1);
    if(mode=="--devices"){std::string s="{\"type\":\"devices\",\"devices\":[";bool first=true;for(const auto& d:WasapiCapture::listDevices()){if(!first)s+=",";first=false;s+="{\"id\":"+q(pathutil::toUtf8(fs::path(d.id)))+",\"name\":"+q(pathutil::toUtf8(fs::path(d.name)))+",\"channels\":"+std::to_string(d.channels)+",\"sampleRate\":"+std::to_string(d.sampleRate)+",\"loopback\":"+(d.isLoopback?"true":"false")+"}";}event(s+"]}");}
    else if(mode=="--prepare"&&argc==6)prepare(argv[2],arg(3),arg(4),argv[5]);
    else if(mode=="--snapshot"&&argc==4)snapshot(arg(2),arg(3));
    else if(mode=="--replay"&&argc==4)replay(argv[2],arg(3));
    else if(mode=="--remove"&&argc==4)removeTracks(arg(2),{arg(3)});
    else if(mode=="--remove-many"&&argc==4){
      std::ifstream list{fs::path(argv[3])};std::vector<std::string> ids;std::string uid;
      if(!list)throw std::runtime_error("Cannot read removal list");
      while(std::getline(list,uid)){
        if(!uid.empty()&&uid.back()=='\r')uid.pop_back();
        if(uid.size()!=36||uid.find_first_not_of("0123456789abcdef-")!=std::string::npos||ids.size()>=50000)throw std::runtime_error("Invalid removal list");
        ids.push_back(uid);
      }
      if(ids.empty())throw std::runtime_error("Empty removal list");
      removeTracks(arg(2),ids);
    }
    else if(mode=="--listen"&&argc==6)listen(arg(2),argv[3],argv[4],std::stoi(arg(5)));
    else throw std::runtime_error("Invalid command arguments");
  }catch(const std::exception& e){event("{\"type\":\"error\",\"message\":"+q(e.what())+"}");MFShutdown();CoUninitialize();return 1;}
  MFShutdown();CoUninitialize();return 0;
}
