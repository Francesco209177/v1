// Polpo — file .ir (formato pubblico "IR signals file" / "IR library file").
#pragma once

#include <string>
#include <vector>

#include "polpo/ir/ir_signal.h"

namespace polpo {

struct IrFile {
    std::string filetype = "IR signals file";
    std::vector<IrSignal> signals;
    std::vector<std::string> warnings;  // segnali saltati o corretti, in italiano
};

// Legge un file .ir. Restituisce false solo se l'intestazione è illeggibile;
// i singoli segnali non validi vengono saltati e annotati in `warnings`.
bool ir_file_parse(const std::string& text, IrFile& out, std::string& err);

std::string ir_file_serialize(const IrFile& file);

// Un solo tasto, da accodare a un file esistente senza riscriverlo (inizia con una riga vuota).
std::string ir_signal_block(const IrSignal& s);

// Valida un segnale (campi entro i bit del protocollo, tempi RAW sensati).
bool ir_signal_validate(const IrSignal& s, std::string& why);

}  // namespace polpo
