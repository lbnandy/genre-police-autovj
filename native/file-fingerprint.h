// Bounded spectrogram adapter. The upstream FFT, peak rules and hashes stay intact.
#pragma once
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <stdexcept>
#include "fp/pipeline.h"
namespace autovj {
inline std::vector<vj::Fingerprint> fingerprintFile(const std::filesystem::path& file) {
  using namespace vj;
  const auto bytes=std::filesystem::file_size(file);
  if(bytes%2)throw std::runtime_error("Invalid mono PCM file");
  const size_t samples=bytes/2,fft=fp_params::FFT_WINDOW,hop=fp_params::HOP_SIZE;
  const size_t frames=samples>=fft?(samples-fft)/hop+1:0;
  constexpr size_t coreFrames=512,halo=fp_params::PEAK_NEIGHBORHOOD;
  std::ifstream in(file,std::ios::binary);if(!in)throw std::runtime_error("Cannot read temporary PCM");
  std::vector<Peak> allPeaks;
  for(size_t core=0;core<frames;core+=coreFrames){
    const size_t end=std::min(frames,core+coreFrames),start=core>halo?core-halo:0;
    const size_t stop=std::min(frames,end+halo),count=(stop-start-1)*hop+fft;
    std::vector<int16_t> pcm(count);
    in.seekg(start*hop*2);if(!in.read((char*)pcm.data(),count*2))throw std::runtime_error("Truncated temporary PCM");
    auto peaks=extractPeaks(computeSpectrogram(pcm.data(),pcm.size(),44100));
    for(auto peak:peaks){peak.timeFrame+=(int)start;if(peak.timeFrame>=(int)core&&peak.timeFrame<(int)end)allPeaks.push_back(peak);}
  }
  // Retain the complete sorted peak sequence so fan-out crosses chunk boundaries.
  return generateHashes(allPeaks);
}
}
