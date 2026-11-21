#include "polpo/wifi/channels.h"

namespace polpo {

ChannelLoad wifi_channel_load(const std::vector<WifiSeen>& nets) {
    ChannelLoad cl;
    static const float kSpread[] = {1.0f, 0.5f, 0.25f};
    for (const auto& n : nets) {
        if (n.channel < 1 || n.channel > 13) continue;
        float w = (static_cast<float>(n.rssi) + 100.0f) / 70.0f;
        if (w < 0.05f) w = 0.05f;
        if (w > 1.0f) w = 1.0f;
        for (int d = -2; d <= 2; ++d) {
            const int c = n.channel + d;
            if (c < 1 || c > 13) continue;
            cl.load[c] += w * kSpread[d < 0 ? -d : d];
        }
    }
    const uint8_t candidates[] = {1, 6, 11};
    cl.best = 1;
    for (uint8_t c : candidates)
        if (cl.load[c] < cl.load[cl.best]) cl.best = c;
    for (int c = 1; c <= 13; ++c)
        if (cl.load[c] > cl.max_load) cl.max_load = cl.load[c];
    return cl;
}

uint8_t rssi_bars(int rssi) {
    if (rssi >= -55) return 4;
    if (rssi >= -67) return 3;
    if (rssi >= -78) return 2;
    if (rssi >= -88) return 1;
    return 0;
}

}  // namespace polpo
