// PCM AIFF/AIFC decoder for AutoVJ, by LBN. MIT.
#pragma once
#include <array>
#include <cstring>
#include <limits>
inline LoadedAudio decodeAiff(const std::wstring& name,const std::wstring& pcmFile=L""){
  std::ifstream in(fs::path(name),std::ios::binary);in.seekg(0,std::ios::end);const auto fileSize=in.tellg();in.seekg(0);
  auto be16=[](const unsigned char* p){return (uint32_t(p[0])<<8)|p[1];};
  auto be32=[](const unsigned char* p){return (uint32_t(p[0])<<24)|(uint32_t(p[1])<<16)|(uint32_t(p[2])<<8)|p[3];};
  unsigned char header[12];if(!in.read((char*)header,12)||memcmp(header,"FORM",4)||(memcmp(header+8,"AIFF",4)&&memcmp(header+8,"AIFC",4)))throw std::runtime_error("Invalid AIFF header");
  bool aifc=!memcmp(header+8,"AIFC",4),little=false,floating=false;uint32_t channels=0,bits=0,frames=0,rate=0;std::streamoff soundAt=0;uint64_t soundSize=0;
  while(in&&in.tellg()+std::streamoff(8)<=fileSize){unsigned char chunk[8];in.read((char*)chunk,8);uint32_t size=be32(chunk+4);auto at=in.tellg();if(at+std::streamoff(size)>fileSize)throw std::runtime_error("Truncated AIFF chunk");
    if(!memcmp(chunk,"COMM",4)){if(size<18||(aifc&&size<22))throw std::runtime_error("Invalid AIFF format");unsigned char comm[22]={};in.read((char*)comm,aifc?22:18);channels=be16(comm);frames=be32(comm+2);bits=be16(comm+6);const uint32_t exponent=be16(comm+8);uint64_t mantissa=(uint64_t(be32(comm+10))<<32)|be32(comm+14);double hz=std::ldexp((double)mantissa,(int)(exponent&0x7fff)-16383-63);if(exponent&0x8000||!std::isfinite(hz)||hz<8000||hz>384000)throw std::runtime_error("Unsupported AIFF sample rate");rate=(uint32_t)std::lround(hz);if(aifc){little=!memcmp(comm+18,"sowt",4);floating=!memcmp(comm+18,"fl32",4)||!memcmp(comm+18,"FL32",4);if(!little&&!floating&&memcmp(comm+18,"NONE",4)&&memcmp(comm+18,"twos",4))throw std::runtime_error("Compressed AIFC is unsupported; convert to PCM AIFF or WAV");}}
    else if(!memcmp(chunk,"SSND",4)){if(size<8)throw std::runtime_error("Invalid AIFF sound data");unsigned char sound[8];in.read((char*)sound,8);uint32_t offset=be32(sound);if(offset>size-8)throw std::runtime_error("Invalid AIFF data offset");soundAt=at+std::streamoff(8+offset);soundSize=size-8-offset;}
    in.seekg(at+std::streamoff(size+(size&1)));
  }
  if(!channels||channels>32||!rate||!soundAt||!frames||!(bits==8||bits==16||bits==24||bits==32)||(floating&&bits!=32))throw std::runtime_error("Unsupported AIFF PCM format");
  const int width=bits/8;const uint64_t bytesPerFrame=channels*width;if(uint64_t(frames)*bytesPerFrame>soundSize)throw std::runtime_error("AIFF frame count exceeds data length");if(uint64_t(frames)>uint64_t(rate)*60*90)throw std::runtime_error("Individual track exceeds 90 minute analysis limit");
  in.clear();in.seekg(soundAt);PcmCollector result(pcmFile);MonoResampler resampler;resampler.reset(rate);std::vector<unsigned char> bytes(4096*bytesPerFrame);std::vector<float> mono,resampled;
  for(uint64_t at=0;at<frames;){const auto count=(std::min)(uint64_t(4096),uint64_t(frames)-at);if(!in.read((char*)bytes.data(),count*bytesPerFrame))throw std::runtime_error("Truncated AIFF PCM");mono.resize(count);
    for(size_t i=0;i<count;i++){double sum=0;for(uint32_t c=0;c<channels;c++){const unsigned char* p=bytes.data()+(i*channels+c)*width;uint32_t raw=0;for(int j=0;j<width;j++)raw=(raw<<8)|p[little?width-1-j:j];float value;if(floating){memcpy(&value,&raw,4);if(!std::isfinite(value))value=0;}else{int32_t signedValue=(int32_t)(raw<<(32-bits));value=(float)((double)signedValue/2147483648.0);}sum+=value;}mono[i]=(float)(sum/channels);}
    resampled.clear();resampler.process(mono.data(),mono.size(),resampled);result.append(resampled);at+=count;
  }return result.finish();
}
