// Polpo — microSD. Tutti i file dell'utente stanno in /polpo/...
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace storage {

constexpr const char* kRoot = "/polpo";
constexpr const char* kIrDir = "/polpo/ir";
constexpr const char* kBadUsbDir = "/polpo/badusb";
constexpr const char* kRfDir = "/polpo/rf433";
constexpr const char* kNfcDir = "/polpo/nfc";
constexpr const char* kLogDir = "/polpo/logs";

bool begin();
bool ok();
bool retry();  // ritenta il montaggio (scheda inserita dopo l'avvio)

struct Entry {
    std::string name;
    bool dir = false;
    uint32_t size = 0;
};

bool list(const std::string& dir, std::vector<Entry>& out, const char* ext_filter = nullptr);
bool read_text(const std::string& path, std::string& out, size_t max_bytes = 64 * 1024);
// Scrittura sicura: prima in un file temporaneo, poi rinomina.
bool write_text(const std::string& path, const std::string& data);
bool append_text(const std::string& path, const std::string& data);
bool exists(const std::string& path);
bool remove(const std::string& path);
bool mkdirs(const std::string& path);
// "/polpo/ir/Sala.ir" se libero, altrimenti "/polpo/ir/Sala_2.ir", ...
std::string unique_path(const std::string& dir, const std::string& base, const std::string& ext);
std::string basename(const std::string& path);
std::string join(const std::string& dir, const std::string& name);
uint64_t total_bytes();
uint64_t used_bytes();

// Crea le cartelle di lavoro e, se mancano, i file di esempio.
void ensure_layout();

}  // namespace storage
