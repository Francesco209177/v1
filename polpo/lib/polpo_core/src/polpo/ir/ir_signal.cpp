#include "polpo/ir/ir_signal.h"

#include "polpo/util/strutil.h"

namespace polpo {

// Parametri pubblici dei protocolli (tempi standard documentati per ciascuna famiglia).
static const IrProtocolInfo kInfo[] = {
    {"NEC", 8, 8, 38000, 0.33f, 1, 40000},
    {"NECext", 16, 16, 38000, 0.33f, 1, 40000},
    {"NEC42", 13, 8, 38000, 0.33f, 1, 40000},
    {"NEC42ext", 26, 16, 38000, 0.33f, 1, 40000},
    {"Samsung32", 8, 8, 38000, 0.33f, 1, 46000},
    {"RC5", 5, 6, 36000, 0.33f, 1, 89000},
    {"RC5X", 5, 7, 36000, 0.33f, 1, 89000},
    {"RC6", 8, 8, 36000, 0.33f, 1, 83000},
    {"SIRC", 5, 7, 40000, 0.33f, 3, 25000},
    {"SIRC15", 8, 7, 40000, 0.33f, 3, 25000},
    {"SIRC20", 13, 7, 40000, 0.33f, 3, 20000},
    {"Kaseikyo", 26, 10, 37000, 0.33f, 1, 74000},
    {"RCA", 4, 8, 56000, 0.33f, 1, 8000},
    {"Pioneer", 8, 8, 40000, 0.33f, 2, 26000},
};
static const IrProtocolInfo kUnknown = {"Unknown", 0, 0, 38000, 0.33f, 1, 40000};

const IrProtocolInfo& ir_protocol_info(IrProtocol p) {
    auto i = static_cast<int>(p);
    if (i < 0 || i >= kIrProtocolCount) return kUnknown;
    return kInfo[i];
}

IrProtocol ir_protocol_from_name(const std::string& name) {
    for (int i = 0; i < kIrProtocolCount; ++i)
        if (iequals(name, kInfo[i].name)) return static_cast<IrProtocol>(i);
    return IrProtocol::Unknown;
}

}  // namespace polpo
