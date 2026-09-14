// QA-only executable: compare bounded preparation against the pinned pipeline.
#include "file-fingerprint.h"
#include <iostream>
#include <cmath>
int main(int argc,char** argv){
  if(argc==3){
    const auto file=std::filesystem::path(argv[2]);
    if(std::string(argv[1])=="--bounded"){std::cout<<autovj::fingerprintFile(file).size()<<" hashes\n";return 0;}
    if(std::string(argv[1])=="--reference"){
      std::vector<int16_t> pcm(std::filesystem::file_size(file)/2);std::ifstream in(file,std::ios::binary);in.read((char*)pcm.data(),pcm.size()*2);
      std::cout<<vj::fingerprintSignal(pcm.data(),pcm.size(),44100).size()<<" hashes\n";return 0;
    }
  }
  if(argc!=2)return 2;
  const auto file=std::filesystem::path(argv[1]);
  try {
    for(int frames:{0,1,40,41,42,511,512,513,1024,1030,1600}){
      size_t n=frames?(frames-1)*2048+4096+777:100;
      std::vector<int16_t> pcm(n);uint32_t state=7201;
      for(size_t i=0;i<n;i++){
        state=1664525*state+1013904223;
        double t=(double)i/44100,f=100+(double)((i/6000*157)%12000);
        pcm[i]=(int16_t)(18000*std::sin(6.283185307179586*t*f)+4000*((double)state/4294967296-.5));
      }
      for(bool silence:{false,true}){
        if(silence)std::fill(pcm.begin(),pcm.end(),0);
        {std::ofstream out(file,std::ios::binary|std::ios::trunc);out.write((const char*)pcm.data(),pcm.size()*2);}
        auto expected=vj::fingerprintSignal(pcm.data(),pcm.size(),44100),actual=autovj::fingerprintFile(file);
        if(expected.size()!=actual.size())throw std::runtime_error("Hash count mismatch at "+std::to_string(frames));
        for(size_t i=0;i<expected.size();i++)if(expected[i].hash!=actual[i].hash||expected[i].offset!=actual[i].offset)throw std::runtime_error("Hash mismatch at "+std::to_string(frames));
        std::cout<<frames<<" frames, silence="<<silence<<", "<<actual.size()<<" hashes: identical\n";
      }
    }
    return 0;
  }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}
}
