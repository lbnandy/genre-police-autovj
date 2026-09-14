// AutoVJ preparation sink. Keep the same quantization as the live/replay decoder.
#pragma once
struct PcmCollector {
  LoadedAudio audio;
  std::ofstream stream;
  size_t count=0;
  bool toFile=false;
  explicit PcmCollector(const std::wstring& file) : toFile(!file.empty()) {
    audio.sampleRate=44100;
    if(toFile){stream.open(fs::path(file),std::ios::binary|std::ios::trunc);if(!stream)throw std::runtime_error("Cannot save temporary PCM");}
  }
  void append(const std::vector<float>& input) {
    count+=input.size();
    if(count>44100ULL*60*90)throw std::runtime_error("Individual track exceeds 90 minute analysis limit");
    std::vector<int16_t> block;block.reserve(input.size());
    for(float f:input)block.push_back((int16_t)std::lround(std::clamp(f,-1.f,1.f)*32767.f));
    if(toFile){stream.write((const char*)block.data(),block.size()*2);if(!stream)throw std::runtime_error("Cannot save temporary PCM");}
    else audio.monoSamples.insert(audio.monoSamples.end(),block.begin(),block.end());
  }
  LoadedAudio finish(){
    if(!count)throw std::runtime_error("No decoded audio");
    if(toFile){stream.close();if(!stream)throw std::runtime_error("Cannot save temporary PCM");}
    return std::move(audio);
  }
};
