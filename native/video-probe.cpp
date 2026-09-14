// Test receiver, built for QA only and excluded from application packaging.
#include "video-common.h"
#include "SpoutDX.h"
#include <iostream>
#include <fstream>
#include <chrono>
#include <thread>
#include <vector>

using Clock=std::chrono::steady_clock;
int wmain(int argc,wchar_t** argv) {
  if(argc!=5)return 2;
  try{
    std::string route=utf8(argv[1]),name=utf8(argv[2]);const int seconds=std::stoi(argv[3]);
    std::vector<uint8_t> pixels;int width=0,height=0,frames=0;bool rgba=false;
    const auto start=Clock::now(),end=start+std::chrono::seconds(seconds);
    if(route=="spout"){
      spoutDX receiver;receiver.DisableSpoutLog();receiver.OpenDirectX11();receiver.SetReceiverName(name.c_str());
      ComPtr<ID3D11Texture2D> staging;int priorW=0,priorH=0;DXGI_FORMAT priorFormat=DXGI_FORMAT_UNKNOWN;
      while(Clock::now()<end){
        if(receiver.ReceiveTexture()&&receiver.IsFrameNew()){
          auto source=receiver.GetSenderTexture();if(!source){Sleep(1);continue;}D3D11_TEXTURE2D_DESC d{};source->GetDesc(&d);
          width=d.Width;height=d.Height;rgba=d.Format==DXGI_FORMAT_R8G8B8A8_UNORM;
          if(width!=priorW||height!=priorH||d.Format!=priorFormat){staging.Reset();priorW=width;priorH=height;priorFormat=d.Format;d.BindFlags=0;d.MiscFlags=0;d.Usage=D3D11_USAGE_STAGING;d.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
            check(receiver.GetDX11Device()->CreateTexture2D(&d,nullptr,&staging),"Create probe texture");pixels.resize(size_t(width)*height*4);}
          auto context=receiver.GetDX11Context();context->CopyResource(staging.Get(),source);D3D11_MAPPED_SUBRESOURCE map{};
          check(context->Map(staging.Get(),0,D3D11_MAP_READ,0,&map),"Read Spout probe");
          for(int y=0;y<height;y++)memcpy(pixels.data()+size_t(y)*width*4,(uint8_t*)map.pData+size_t(y)*map.RowPitch,size_t(width)*4);
          context->Unmap(staging.Get(),0);frames++;
        }Sleep(1);
      }receiver.ReleaseReceiver();receiver.CloseDirectX11();
    }else if(route=="ndi"){
      NdiRuntime ndi;ndi.open();auto find=ndi.api->find_create_v2(nullptr);NDIlib_recv_instance_t receive=nullptr;
      while(Clock::now()<end){
        if(!receive){uint32_t count=0;auto sources=ndi.api->find_get_current_sources(find,&count);
          for(uint32_t i=0;i<count;i++)if(std::string(sources[i].p_ndi_name).find("("+name+")")!=std::string::npos){NDIlib_recv_create_v3_t create{};create.source_to_connect_to=sources[i];create.color_format=NDIlib_recv_color_format_BGRX_BGRA;create.allow_video_fields=false;receive=ndi.api->recv_create_v3(&create);break;}
          if(!receive){ndi.api->find_wait_for_sources(find,200);continue;}}
        NDIlib_video_frame_v2_t frame{};auto type=ndi.api->recv_capture_v2(receive,&frame,nullptr,nullptr,200);
        if(type==NDIlib_frame_type_video){width=frame.xres;height=frame.yres;pixels.resize(size_t(width)*height*4);
          for(int y=0;y<height;y++)memcpy(pixels.data()+size_t(y)*width*4,frame.p_data+size_t(y)*frame.line_stride_in_bytes,size_t(width)*4);
          frames++;ndi.api->recv_free_video_v2(receive,&frame);}
      }if(receive)ndi.api->recv_destroy(receive);ndi.api->find_destroy(find);
    }else return 2;
    if(rgba)for(size_t i=0;i<pixels.size();i+=4)std::swap(pixels[i],pixels[i+2]);
    size_t bright=0;uint64_t sum=0;for(size_t i=0;i<pixels.size();i+=4){sum+=pixels[i]+pixels[i+1]+pixels[i+2];if(std::max(pixels[i],std::max(pixels[i+1],pixels[i+2]))>100)bright++;}
    if(!pixels.empty()){std::ofstream file(std::filesystem::path(argv[4]),std::ios::binary);file.write((const char*)pixels.data(),pixels.size());}
    std::cout<<"{\"width\":"<<width<<",\"height\":"<<height<<",\"frames\":"<<frames<<",\"bright\":"<<bright<<",\"sum\":"<<sum<<"}"<<std::endl;
    return frames>0?0:3;
  }catch(const std::exception& e){std::cerr<<e.what()<<std::endl;return 1;}
}
