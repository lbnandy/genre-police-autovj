#include <ableton/Link.hpp>
#include <iostream>
#include <string>
int main() {
  ableton::Link link(120.0);
  std::string command;
  while (std::getline(std::cin, command)) {
    if (command == "on") link.enable(true);
    else if (command == "off") link.enable(false);
    else if (command == "quit") break;
    else if (command == "status") std::cout << link.numPeers() << std::endl;
  }
  link.enable(false);
}
