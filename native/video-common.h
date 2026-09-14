#pragma once
#include <windows.h>
#include <d3d11_1.h>
#include <dxgi1_6.h>
#include <wrl/client.h>
#include <string>
#include <sstream>
#include <stdexcept>
#include <filesystem>
#include "Processing.NDI.Lib.h"

using Microsoft::WRL::ComPtr;
inline std::string utf8(const std::wstring& s) {
  int n=WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0,nullptr,nullptr);
  std::string r(n,0); WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),r.data(),n,nullptr,nullptr); return r;
}
inline std::string quote(const std::string& s) {
  std::string r="\""; for(unsigned char c:s) {if(c=='"'||c=='\\')r+='\\'; if(c>=32)r+=c;} return r+'"';
}
inline void check(HRESULT hr,const char* action) {
  if(FAILED(hr)){std::ostringstream s;s<<action<<" (0x"<<std::hex<<(unsigned long)hr<<")";throw std::runtime_error(s.str());}
}
struct NdiRuntime {
  HMODULE module=nullptr; const NDIlib_v6* api=nullptr;
  void open() {
    if(api)return;
    if(module){FreeLibrary(module);module=nullptr;}
    wchar_t exe[32768];GetModuleFileNameW(nullptr,exe,32768);
    auto dll=std::filesystem::path(exe).parent_path()/L"Processing.NDI.Lib.x64.dll";
    // App-local runtime only. Never search CWD/PATH for executable code.
    module=LoadLibraryExW(dll.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);
    if(!module)throw std::runtime_error("NDI runtime missing or unable to load");
    auto load=(const NDIlib_v6* (*)())GetProcAddress(module,"NDIlib_v6_load");
    if(!load||!(api=load())||!api->initialize()){api=nullptr;throw std::runtime_error("NDI runtime initialization failed");}
  }
  ~NdiRuntime(){if(api)api->destroy();if(module)FreeLibrary(module);}
};
