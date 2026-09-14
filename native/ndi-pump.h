#pragma once
#include "video-common.h"
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

// The GPU/Spout thread never waits for NDI compression or network submission.
// Three reusable CPU slots: current (SDK-owned), queued, and being filled.
// A newer queued frame replaces an older one; there is no growing frame queue.
class NdiPump {
  const NDIlib_v6* api;
  NDIlib_send_instance_t sender;
  struct Slot {std::vector<uint8_t> pixels; bool used=false; uint64_t epoch=0;};
  std::array<Slot,3> slots;
  std::vector<uint8_t> blackPixels;
  std::thread thread;
  std::mutex mutex;
  std::condition_variable wake;
  bool stopping=false,forceBlack=true;
  uint64_t epoch=0;
  int pending=-1,width,height,fps;
  void run() {
    using C=std::chrono::steady_clock;
    int current=-1;auto next=C::now(),nextConnections=C::now();
    const auto interval=std::chrono::nanoseconds(1000000000/fps);
    while(true){
      int selected=-1;bool blackNow;
      {std::unique_lock<std::mutex> lock(mutex);
        wake.wait_until(lock,next,[&]{return stopping;});if(stopping)break;
        if(pending>=0 && slots[pending].epoch!=epoch){slots[pending].used=false;pending=-1;}
        blackNow=forceBlack;
        if(!blackNow && pending>=0){selected=pending;pending=-1;}
        else if(!blackNow && current>=0 && slots[current].epoch==epoch)selected=current;
      }
      if(C::now()>=nextConnections){connections=api->send_get_no_connections(sender,0);nextConnections=C::now()+std::chrono::milliseconds(100);}
      if(connections>0){
        NDIlib_video_frame_v2_t frame{};frame.xres=width;frame.yres=height;frame.frame_rate_N=fps;frame.frame_rate_D=1;
        frame.FourCC=NDIlib_FourCC_video_type_BGRX;frame.picture_aspect_ratio=float(width)/height;
        frame.frame_format_type=NDIlib_frame_format_type_progressive;frame.timecode=NDIlib_send_timecode_synthesize;
        frame.p_data=selected<0?blackPixels.data():slots[selected].pixels.data();frame.line_stride_in_bytes=width*4;
        // This call synchronizes the PREVIOUS frame before owning this one.
        api->send_send_video_async_v2(sender,&frame);frames++;
      }else if(current>=0){api->send_send_video_async_v2(sender,nullptr);}
      {std::lock_guard<std::mutex> lock(mutex);
        if(current>=0 && current!=selected)slots[current].used=false;
        current=selected;
      }
      next+=interval;if(next<C::now()-interval)next=C::now()+interval;
    }
    api->send_send_video_async_v2(sender,nullptr);
  }
public:
  std::atomic<int> connections{0},frames{0};
  NdiPump(const NDIlib_v6* a,NDIlib_send_instance_t s,int w,int h,int f):api(a),sender(s),width(w),height(h),fps(f) {
    for(auto& slot:slots)slot.pixels.resize(size_t(w)*h*4);
    blackPixels.resize(size_t(w)*h*4,0);
    thread=std::thread([this]{run();});
  }
  ~NdiPump(){ {std::lock_guard<std::mutex> lock(mutex);stopping=true;}wake.notify_one();if(thread.joinable())thread.join(); }
  int acquire(){std::lock_guard<std::mutex> lock(mutex);for(int i=0;i<3;i++)if(!slots[i].used){slots[i].used=true;return i;}return -1;}
  uint8_t* data(int slot){return slots[slot].pixels.data();}
  void publish(int slot,uint64_t generation){std::lock_guard<std::mutex> lock(mutex);
    if(pending>=0)slots[pending].used=false;slots[slot].epoch=generation;pending=slot;
  }
  void discard(int slot){std::lock_guard<std::mutex> lock(mutex);slots[slot].used=false;}
  void state(bool black,uint64_t generation){std::lock_guard<std::mutex> lock(mutex);forceBlack=black;epoch=generation;}
};
