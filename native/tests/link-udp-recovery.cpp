#include <ableton/Link.hpp>
#include <ableton/platforms/asio/Socket.hpp>
#include <iostream>
// Exercise the completion path that Windows uses for a departed UDP peer.
int main() {
  for (const int code : {10054, 0}) {
    LINK_ASIO_NAMESPACE::io_service io;
    ableton::platforms::LINK_ASIO_NAMESPACE::Socket<512> socket(io, LINK_ASIO_NAMESPACE::ip::udp::v4());
    socket.mpImpl->mSocket.bind({LINK_ASIO_NAMESPACE::ip::address_v4::loopback(), 0});
    int received=0;
    socket.mpImpl->mHandler=[&](const auto&, auto begin, auto end) { if(end-begin==1 && *begin==42) ++received; };
    (*socket.mpImpl)(LINK_ASIO_NAMESPACE::error_code(code, LINK_ASIO_NAMESPACE::error::get_system_category()), 0);
    LINK_ASIO_NAMESPACE::ip::udp::socket sender(io,LINK_ASIO_NAMESPACE::ip::udp::v4());
    LINK_ASIO_NAMESPACE::steady_timer send(io),deadline(io);const uint8_t value=42;
    send.expires_from_now(std::chrono::milliseconds(30));
    send.async_wait([&](const auto&){sender.send_to(LINK_ASIO_NAMESPACE::buffer(&value,1),socket.endpoint());});
    deadline.expires_from_now(std::chrono::milliseconds(150));deadline.async_wait([&](const auto&){io.stop();});
    io.run();if(received!=1){std::cerr << "Receive did not recover: " << code << std::endl;return 1;}
  }
  std::cout << "UDP receive recovers after WSAECONNRESET and empty datagrams" << std::endl;
}
