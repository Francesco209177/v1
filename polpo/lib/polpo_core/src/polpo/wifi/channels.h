// Polpo — analisi dei canali Wi-Fi 2,4 GHz (Europa: canali 1-13) a partire da una scansione.
#pragma once

#include <cstdint>
#include <vector>

namespace polpo {

struct WifiSeen {
    uint8_t channel;  // 1-14
    int8_t rssi;      // dBm
};

struct ChannelLoad {
    float load[14] = {};  // indice 1..13 (0 non usato)
    uint8_t best = 1;     // il migliore tra 1, 6 e 11 (canali che non si sovrappongono)
    float max_load = 0.0f;
};

// Ogni rete pesa in base al segnale e "sporca" anche i 2 canali vicini per lato (larghezza 20 MHz).
ChannelLoad wifi_channel_load(const std::vector<WifiSeen>& nets);

// 0..4 tacche dal valore RSSI.
uint8_t rssi_bars(int rssi);

}  // namespace polpo
