// Polpo — segnali infrarossi: protocolli supportati e struttura del segnale.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

enum class IrProtocol : uint8_t {
    NEC,
    NECext,
    NEC42,
    NEC42ext,
    Samsung32,
    RC5,
    RC5X,
    RC6,
    SIRC,
    SIRC15,
    SIRC20,
    Kaseikyo,
    RCA,
    Pioneer,
    Unknown,
};

struct IrProtocolInfo {
    const char* name;      // nome nel file .ir
    uint8_t address_bits;  // bit significativi del campo address
    uint8_t command_bits;  // bit significativi del campo command
    uint32_t frequency;    // portante in Hz
    float duty;            // duty cycle della portante
    uint8_t min_frames;    // quante volte inviare il frame per un singolo tasto
    uint32_t frame_gap_us; // silenzio tra frame ripetuti
};

const IrProtocolInfo& ir_protocol_info(IrProtocol p);
// Nome -> protocollo (maiuscole/minuscole indifferenti). Unknown se sconosciuto.
IrProtocol ir_protocol_from_name(const std::string& name);
constexpr int kIrProtocolCount = static_cast<int>(IrProtocol::Unknown);

constexpr size_t kIrMaxRawTimings = 1024;       // limite del formato .ir
constexpr uint32_t kIrMaxRawTimingUs = 100000;  // un singolo tempo RAW: max 100 ms
constexpr uint32_t kIrMaxRawTotalUs = 2000000;  // un segnale RAW: max 2 s

struct IrSignal {
    std::string name;
    bool raw = false;
    // Segnale "parsed"
    IrProtocol protocol = IrProtocol::Unknown;
    uint32_t address = 0;
    uint32_t command = 0;
    // Segnale "raw"
    uint32_t frequency = 38000;
    float duty = 0.33f;
    std::vector<uint32_t> timings;  // µs, alterna impulso/pausa, inizia con impulso
};

// Tempi pronti da trasmettere: durate in µs, la prima è un impulso (portante accesa),
// poi si alternano pausa / impulso.
struct IrTimings {
    uint32_t frequency = 38000;
    float duty = 0.33f;
    std::vector<uint32_t> durations;
};

}  // namespace polpo
