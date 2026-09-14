// Full Chromium composition -> D3D11 -> Spout / NDI High Bandwidth.
// This process owns all native video work. Electron retains each source texture
// until an ACK after the GPU copy completes; at most one source is in flight.
#include "video-common.h"
#include "ndi-pump.h"
#include "SpoutDX.h"
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <vector>
#include <chrono>
#include <iomanip>
#include <mmsystem.h>
#include <d3dcompiler.h>
#include <deque>
#include <memory>

using Clock=std::chrono::steady_clock;
struct Frame {uint64_t id=0,handle=0;};
class VideoOutput {
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11Device1> device1;
  ComPtr<ID3D11DeviceContext> context;
  ComPtr<ID3D11Texture2D> latest,inflightSource;
  struct Readback {ComPtr<ID3D11Texture2D> texture;ComPtr<ID3D11Query> fence;uint64_t epoch=0;};
  std::array<Readback,2> readbacks;
  std::deque<int> readbackQueue;
  uint64_t epoch=1;
  Clock::time_point copyDeadline;
  ComPtr<ID3D11RenderTargetView> target;
  ComPtr<ID3D11Query> fence;
  ComPtr<ID3D11VertexShader> vertex;
  ComPtr<ID3D11PixelShader> pixel;
  ComPtr<ID3D11SamplerState> sampler;
  spoutDX spout;
  NdiRuntime ndi;
  NDIlib_send_instance_t sender=nullptr;
  std::unique_ptr<NdiPump> ndiPump;
  DXGI_FORMAT format=DXGI_FORMAT_B8G8R8A8_UNORM;
  bool spoutOn=false,ndiOn=false,black=false,hasFrame=false;
  std::string spoutError,ndiError,adapter,senderName;
  int width,height,fps,spoutFrames=0,sourceFrames=0,readbackFrames=0;
  Clock::time_point lastFrame=Clock::now(),statsAt=Clock::now();
  bool pixelDirty=true;
public:
  VideoOutput(int w,int h,int f,bool s,bool n,const std::string& name):width(w),height(h),fps(f),senderName(name) {
    spout.DisableSpoutLog();
    check(D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,
      nullptr,0,D3D11_SDK_VERSION,&device,nullptr,&context),"Create video device");
    initializeGpu();
    routes(s,n);
    std::cout<<"{\"type\":\"ready\",\"adapter\":"<<quote(adapter)<<",\"spoutName\":"<<quote(spoutOn?spout.GetName():"")
      <<",\"ndiVersion\":"<<quote(ndi.api?ndi.api->version():"")<<",\"spoutError\":"<<quote(spoutError)<<",\"ndiError\":"<<quote(ndiError)<<"}"<<std::endl;
  }
  ~VideoOutput(){ndiPump.reset();if(sender)ndi.api->send_destroy(sender);spout.ReleaseSender();spout.CloseDirectX11();}
  void routes(bool useSpout,bool useNdi) {
    if(useSpout!=spoutOn){
      spoutOn=useSpout;spoutError.clear();spoutFrames=0;
      if(spoutOn){if(!spout.OpenDirectX11(device.Get())||!spout.SetSenderName(senderName.c_str()))spoutError="Spout initialization failed";}
      else spout.ReleaseSender();
    }
    if(useNdi!=ndiOn){
      ndiOn=useNdi;ndiError.clear();
      if(ndiOn){try{
        ndi.open();NDIlib_send_create_t create{};create.p_ndi_name=senderName.c_str();create.clock_video=false;create.clock_audio=false;
        sender=ndi.api->send_create(&create);if(!sender)throw std::runtime_error("NDI sender creation failed");
        ndiPump=std::make_unique<NdiPump>(ndi.api,sender,width,height,fps);
        createReadback();pixelDirty=true;
      }catch(const std::exception& e){ndiError=e.what();}}
      else{ndiPump.reset();if(sender)ndi.api->send_destroy(sender);sender=nullptr;readbacks={};readbackQueue.clear();}
    }
  }
  void routeStatus(){std::cout<<"{\"type\":\"routes\",\"spout\":"<<(spoutOn?"true":"false")<<",\"ndi\":"<<(ndiOn?"true":"false")
    <<",\"spoutName\":"<<quote(spoutOn?spout.GetName():"")<<",\"ndiVersion\":"<<quote(ndi.api?ndi.api->version():"")
    <<",\"spoutError\":"<<quote(spoutError)<<",\"ndiError\":"<<quote(ndiError)<<"}"<<std::endl;}
  void initializeGpu() {
    device1.Reset();fence.Reset();vertex.Reset();pixel.Reset();sampler.Reset();
    check(device.As(&device1),"D3D11.1 required");
    ComPtr<IDXGIDevice> dxgi;ComPtr<IDXGIAdapter> gpu;DXGI_ADAPTER_DESC desc{};
    check(device.As(&dxgi),"Get GPU");dxgi->GetAdapter(&gpu);gpu->GetDesc(&desc);adapter=utf8(desc.Description);
    D3D11_QUERY_DESC query{D3D11_QUERY_EVENT,0};check(device->CreateQuery(&query,&fence),"Create GPU fence");
    const char* shader="Texture2D image:register(t0);SamplerState linearSampler:register(s0);struct V{float4 pos:SV_Position;float2 uv:TEXCOORD0;};V vs(uint id:SV_VertexID){V v;v.uv=float2((id<<1)&2,id&2);v.pos=float4(v.uv*float2(2,-2)+float2(-1,1),0,1);return v;}float4 ps(V v):SV_Target{return float4(image.Sample(linearSampler,v.uv).rgb,1);}";
    ComPtr<ID3DBlob> vs,ps,errors;
    check(D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,"vs","vs_4_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&vs,&errors),"Compile video vertex shader");
    check(D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,"ps","ps_4_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&ps,&errors),"Compile video pixel shader");
    check(device->CreateVertexShader(vs->GetBufferPointer(),vs->GetBufferSize(),nullptr,&vertex),"Create video vertex shader");
    check(device->CreatePixelShader(ps->GetBufferPointer(),ps->GetBufferSize(),nullptr,&pixel),"Create video pixel shader");
    D3D11_SAMPLER_DESC sample{};sample.Filter=D3D11_FILTER_MIN_MAG_MIP_LINEAR;sample.AddressU=sample.AddressV=sample.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sample.MaxLOD=D3D11_FLOAT32_MAX;
    check(device->CreateSamplerState(&sample,&sampler),"Create video sampler");
    textures(format);
    if(spoutOn){if(!spout.OpenDirectX11(device.Get())||!spout.SetSenderName(senderName.c_str()))spoutError="Spout initialization failed";}
  }
  void textures(DXGI_FORMAT nextFormat) {
    latest.Reset();readbacks={};readbackQueue.clear();target.Reset();format=nextFormat;
    D3D11_TEXTURE2D_DESC d{};d.Width=width;d.Height=height;d.MipLevels=1;d.ArraySize=1;d.Format=format;d.SampleDesc.Count=1;d.Usage=D3D11_USAGE_DEFAULT;d.BindFlags=D3D11_BIND_RENDER_TARGET|D3D11_BIND_SHADER_RESOURCE;
    check(device->CreateTexture2D(&d,nullptr,&latest),"Create output texture");
    check(device->CreateRenderTargetView(latest.Get(),nullptr,&target),"Create black frame target");
    if(ndiOn)createReadback();
    clear();
  }
  void createReadback(){D3D11_TEXTURE2D_DESC d{};latest->GetDesc(&d);d.Usage=D3D11_USAGE_STAGING;d.BindFlags=0;d.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
    readbackQueue.clear();readbacks={};
    for(auto& r:readbacks){check(device->CreateTexture2D(&d,nullptr,&r.texture),"Create NDI readback");
      D3D11_QUERY_DESC q{D3D11_QUERY_EVENT,0};check(device->CreateQuery(&q,&r.fence),"Create readback fence");}}
  void clear(){const float color[4]={0,0,0,1};context->ClearRenderTargetView(target.Get(),color);pixelDirty=true;}
  void blackout(bool enabled){if(black==enabled)return;black=enabled;epoch++;hasFrame=false;clear();if(ndiPump)ndiPump->state(true,epoch);}
  void copy(HANDLE parent,const Frame& frame) {
    HANDLE shared=nullptr;
    if(!DuplicateHandle(parent,(HANDLE)(uintptr_t)frame.handle,GetCurrentProcess(),&shared,0,FALSE,DUPLICATE_SAME_ACCESS))throw std::runtime_error("Duplicate source texture handle failed");
    ComPtr<ID3D11Texture2D> source;
    HRESULT opened=device1->OpenSharedResource1(shared,IID_PPV_ARGS(&source));
    if(FAILED(opened)) {
      // Chromium can choose a different adapter on hybrid-GPU laptops.
      // Match the real shared texture instead of forcing a system-wide GPU.
      ComPtr<IDXGIFactory1> factory;
      if(SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(&factory)))) {
        for(UINT i=0;i<16 && FAILED(opened);i++) {
          ComPtr<IDXGIAdapter1> candidate;if(factory->EnumAdapters1(i,&candidate)==DXGI_ERROR_NOT_FOUND)break;
          DXGI_ADAPTER_DESC1 info{};candidate->GetDesc1(&info);if(info.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)continue;
          ComPtr<ID3D11Device> nextDevice;ComPtr<ID3D11DeviceContext> nextContext;ComPtr<ID3D11Device1> nextDevice1;
          if(FAILED(D3D11CreateDevice(candidate.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&nextDevice,nullptr,&nextContext))||FAILED(nextDevice.As(&nextDevice1)))continue;
          source.Reset();opened=nextDevice1->OpenSharedResource1(shared,IID_PPV_ARGS(&source));
          if(SUCCEEDED(opened)) {
            spout.ReleaseSender();spout.CloseDirectX11();context->ClearState();context->Flush();
            context=nextContext;device=nextDevice;
            try{initializeGpu();}catch(...){CloseHandle(shared);throw;}
          }
        }
      }
    }
    CloseHandle(shared);
    check(opened,"Open shared GPU texture (check GPU adapter)");
    D3D11_TEXTURE2D_DESC d{};source->GetDesc(&d);
    if(d.Width<1||d.Height<1||d.Width>8192||d.Height>8192)throw std::runtime_error("Invalid source dimensions");
    if(d.Format!=DXGI_FORMAT_B8G8R8A8_UNORM&&d.Format!=DXGI_FORMAT_R8G8B8A8_UNORM)throw std::runtime_error("Unsupported source pixel format");
    if(!black){
      if(d.Format==format&&(int)d.Width==width&&(int)d.Height==height)context->CopyResource(latest.Get(),source.Get());
      else {
        // OS window sizes are integer DIPs. At fractional Windows scaling they
        // can produce a one-pixel difference; resample on GPU to exact video size.
        ComPtr<ID3D11ShaderResourceView> view;
        check(device->CreateShaderResourceView(source.Get(),nullptr,&view),"Read video texture");
        D3D11_VIEWPORT viewport{0,0,(float)width,(float)height,0,1};context->RSSetViewports(1,&viewport);
        context->OMSetRenderTargets(1,target.GetAddressOf(),nullptr);context->IASetInputLayout(nullptr);
        context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        context->VSSetShader(vertex.Get(),nullptr,0);context->PSSetShader(pixel.Get(),nullptr,0);
        context->PSSetSamplers(0,1,sampler.GetAddressOf());context->PSSetShaderResources(0,1,view.GetAddressOf());context->Draw(3,0);
        ID3D11ShaderResourceView* none=nullptr;context->PSSetShaderResources(0,1,&none);
      }
      pixelDirty=true;
    }
    // Flush alone does not make it safe for Chromium to recycle its texture.
    context->End(fence.Get());context->Flush();copyDeadline=Clock::now()+std::chrono::milliseconds(750);
    inflightSource=source;
  }
  bool completeCopy(){
    const HRESULT result=context->GetData(fence.Get(),nullptr,0,D3D11_ASYNC_GETDATA_DONOTFLUSH);
    if(result==S_FALSE){if(Clock::now()>copyDeadline)throw std::runtime_error("GPU copy timed out");return false;}
    check(result,"Complete GPU copy");inflightSource.Reset();lastFrame=Clock::now();hasFrame=true;sourceFrames++;return true;
  }
  void readNdi(){
    if(!ndiPump || ndiPump->connections==0 || black || !hasFrame)return;
    // Read an earlier GPU copy only when its fence is ready. Never block Spout.
    while(!readbackQueue.empty()){
      const int index=readbackQueue.front();auto& r=readbacks[index];
      const HRESULT ready=context->GetData(r.fence.Get(),nullptr,0,D3D11_ASYNC_GETDATA_DONOTFLUSH);
      if(ready==S_FALSE)break;check(ready,"Complete NDI readback");
      const int slot=ndiPump->acquire();if(slot<0)break;
      D3D11_MAPPED_SUBRESOURCE map{};
      const HRESULT mapped=context->Map(r.texture.Get(),0,D3D11_MAP_READ,D3D11_MAP_FLAG_DO_NOT_WAIT,&map);
      if(mapped==DXGI_ERROR_WAS_STILL_DRAWING){ndiPump->discard(slot);break;}
      if(FAILED(mapped)){ndiPump->discard(slot);check(mapped,"Read NDI frame");}
      auto* pixels=ndiPump->data(slot);
      for(int y=0;y<height;y++)memcpy(pixels+size_t(y)*width*4,(uint8_t*)map.pData+size_t(y)*map.RowPitch,size_t(width)*4);
      context->Unmap(r.texture.Get(),0);readbackQueue.pop_front();
      if(r.epoch==epoch){ndiPump->publish(slot,epoch);readbackFrames++;}else ndiPump->discard(slot);
    }
    if(pixelDirty && readbackQueue.size()<readbacks.size()){
      const int index=readbackQueue.empty()?0:1-readbackQueue.front();auto& r=readbacks[index];
      context->CopyResource(r.texture.Get(),latest.Get());context->End(r.fence.Get());context->Flush();
      r.epoch=epoch;readbackQueue.push_back(index);pixelDirty=false;
    }
  }
  void send() {
    const bool stalled=Clock::now()-lastFrame>std::chrono::milliseconds(1500);
    if(stalled&&hasFrame){epoch++;clear();hasFrame=false;}
    if(ndiPump)ndiPump->state(black || stalled || !hasFrame,epoch);
    if(spoutOn&&spoutError.empty()){
      if(spout.SendTexture(latest.Get()))spoutFrames++;else spoutError="Spout texture send failed";
    }
    if(sender&&ndiError.empty())readNdi();
    const double seconds=std::chrono::duration<double>(Clock::now()-statsAt).count();
    if(seconds>=1){
      std::cout<<std::fixed<<std::setprecision(1)<<"{\"type\":\"stats\",\"spoutFps\":"<<spoutFrames/seconds<<",\"ndiFps\":"<<(ndiPump?ndiPump->frames.exchange(0)/seconds:0)
        <<",\"sourceFps\":"<<sourceFrames/seconds<<",\"ndiReadbackFps\":"<<readbackFrames/seconds<<",\"ndiReceivers\":"<<(ndiPump?ndiPump->connections.load():0)<<",\"adapter\":"<<quote(adapter)
        <<",\"stalled\":"<<(stalled?"true":"false")<<",\"blackout\":"<<(black?"true":"false")
        <<",\"spoutError\":"<<quote(spoutError)<<",\"ndiError\":"<<quote(ndiError)<<"}"<<std::endl;
      statsAt=Clock::now();spoutFrames=sourceFrames=readbackFrames=0;
    }
  }
};
int wmain(int argc,wchar_t** argv) {
  if(argc!=8)return 2;
  try{
    const DWORD pid=std::stoul(argv[1]);const int width=std::stoi(argv[2]),height=std::stoi(argv[3]),fps=std::stoi(argv[4]);
    if(width<64||height<64||width>3840||height>3840||size_t(width)*height>3840ull*2160||fps<1||fps>60)return 2;
    HANDLE parent=OpenProcess(PROCESS_DUP_HANDLE|SYNCHRONIZE,FALSE,pid);if(!parent)throw std::runtime_error("Cannot open renderer parent");
    VideoOutput output(width,height,fps,std::stoi(argv[5])!=0,std::stoi(argv[6])!=0,utf8(argv[7]));
    std::mutex mutex;std::condition_variable wake;Frame pending;int black=-1,routeSpout=-1,routeNdi=-1;std::atomic<bool> quit{false};
    std::thread input([&]{std::string line;while(std::getline(std::cin,line)){
      if(line.size()>128)break;std::istringstream in(line);char command;in>>command;
      {std::lock_guard<std::mutex> lock(mutex);if(command=='F'){if(pending.id)break;in>>pending.id>>std::hex>>pending.handle;}
       else if(command=='B')in>>black;else if(command=='R')in>>routeSpout>>routeNdi;else if(command=='Q')break;}
      wake.notify_one();
    }quit=true;wake.notify_one();});
    timeBeginPeriod(1);auto next=Clock::now();const auto interval=std::chrono::nanoseconds(1000000000/fps);
    Frame copying;
    try {while(!quit&&WaitForSingleObject(parent,0)==WAIT_TIMEOUT){
      Frame frame;int blackout,spoutRoute,ndiRoute;
      const auto wait=copying.id?(std::min)(next,Clock::now()+std::chrono::milliseconds(1)):next;
      {std::unique_lock<std::mutex> lock(mutex);wake.wait_until(lock,wait,[&]{return quit||pending.id||black>=0||routeSpout>=0;});frame=pending;pending={};blackout=black;black=-1;spoutRoute=routeSpout;ndiRoute=routeNdi;routeSpout=routeNdi=-1;}
      if(spoutRoute>=0){output.routes(spoutRoute!=0,ndiRoute!=0);output.routeStatus();}
      if(blackout>=0)output.blackout(blackout!=0);
      if(frame.id){if(copying.id)throw std::runtime_error("Unexpected queued GPU source");output.copy(parent,frame);copying=frame;}
      if(copying.id && output.completeCopy()){std::cout<<"{\"type\":\"ack\",\"id\":"<<copying.id<<"}"<<std::endl;copying={};}
      auto now=Clock::now();if(now>=next){output.send();next+=interval;if(next<Clock::now()-interval)next=Clock::now()+interval;}
    }}catch(...){quit=true;CancelSynchronousIo(input.native_handle());if(input.joinable())input.join();timeEndPeriod(1);CloseHandle(parent);throw;}
    CancelSynchronousIo(input.native_handle());if(input.joinable())input.join();timeEndPeriod(1);CloseHandle(parent);
  }catch(const std::exception& e){std::cout<<"{\"type\":\"error\",\"message\":"<<quote(e.what())<<"}"<<std::endl;return 1;}return 0;
}
