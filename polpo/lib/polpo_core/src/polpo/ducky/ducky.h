// Polpo — interprete di un sottoinsieme di DuckyScript per BadUSB.
// Il risultato è una lista di azioni semplici (testo, combinazione di tasti, attesa)
// che il firmware esegue SOLO dopo una conferma esplicita sullo schermo.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "polpo/hid/hid_keys.h"

namespace polpo {

enum class DuckyActionType : uint8_t { Text, Key, Delay };

struct DuckyAction {
    DuckyActionType type = DuckyActionType::Delay;
    std::string text;      // Text: UTF-8, già verificato digitabile sul layout
    uint8_t modifiers = 0;  // Key
    uint8_t keycode = 0;    // Key (0 = solo modificatori, es. "GUI")
    uint32_t ms = 0;        // Delay
    uint16_t line = 0;      // riga dello script (per mostrare l'avanzamento)
};

struct DuckyError {
    uint16_t line;
    std::string message;
};

struct DuckyScript {
    std::vector<DuckyAction> actions;
    std::vector<DuckyError> errors;
    uint16_t line_count = 0;
    uint32_t total_delay_ms = 0;
    uint32_t total_chars = 0;
    bool ok() const { return errors.empty(); }
};

// Limiti di sicurezza.
constexpr size_t kDuckyMaxBytes = 32 * 1024;
constexpr uint16_t kDuckyMaxLines = 2000;
constexpr size_t kDuckyMaxActions = 1200;  // ~50 KB di RAM al massimo
constexpr uint32_t kDuckyMaxDelayMs = 60000;
constexpr uint32_t kDuckyMaxRepeat = 500;

DuckyScript ducky_parse(const std::string& source, KbLayout layout);

}  // namespace polpo
