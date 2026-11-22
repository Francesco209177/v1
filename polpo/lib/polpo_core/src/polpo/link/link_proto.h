// Polpo Link — protocollo a righe JSON tra il Polpo e Polpo Studio (USB CDC).
// Parte pura e testabile: divisione in righe, validazione delle richieste, codifiche.
//
//   richiesta  {"id":7,"cmd":"ir.send","args":{...}}
//   risposta   {"id":7,"ok":true,"data":{...}}   oppure   {"id":7,"ok":false,"error":{"code":"...","msg":"..."}}
//   evento     {"ev":"rf.code","data":{...}}
#pragma once

#include <ArduinoJson.h>

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {
namespace link {

constexpr int kProtocolVersion = 1;
constexpr size_t kMaxLine = 2048;     // byte per riga (richieste e risposte)
constexpr size_t kMaxChunk = 768;     // byte di file per blocco fs.read / fs.write (1024 in base64)
constexpr size_t kMaxFileSize = 256 * 1024;

// Divide il flusso in righe terminate da \n (\r ignorato). Righe troppo lunghe vengono scartate
// fino al \n successivo e segnalate una sola volta.
class LineFramer {
public:
    enum class Result { None, Line, Overflow };
    Result feed(char c);
    std::string take();  // riga completa (senza terminatore) dopo Result::Line

private:
    std::string buf_, ready_;
    bool overflow_ = false;
};

struct CommandSpec {
    const char* name;
    bool needs_session;  // richiede che l'utente abbia accettato il collegamento sul Polpo
    bool sensitive;      // richiede una conferma sullo schermo del Polpo a ogni uso
};

const CommandSpec* find_command(const std::string& name);
const std::vector<CommandSpec>& commands();

struct Request {
    uint32_t id = 0;
    std::string cmd;
    const CommandSpec* spec = nullptr;
    JsonDocument doc;  // contiene la richiesta intera
    JsonObjectConst args() const { return doc["args"].as<JsonObjectConst>(); }
};

// Valida una riga. Se la richiesta va eseguita dal dispositivo restituisce una stringa vuota e
// riempie `out`; altrimenti restituisce la risposta completa da inviare (errore o "ping").
std::string preprocess(const std::string& line, bool session_active, bool busy, Request& out);

// Costruzione delle righe di uscita (senza \n finale).
std::string make_ok(uint32_t id, JsonVariantConst data);
std::string make_ok(uint32_t id);
std::string make_error(uint32_t id, const char* code, const char* msg);
std::string make_event(const char* ev, JsonVariantConst data);

// Codifiche per i trasferimenti di file.
std::string base64_encode(const uint8_t* data, size_t len);
bool base64_decode(const std::string& in, std::vector<uint8_t>& out);
uint32_t crc32(const uint8_t* data, size_t len, uint32_t prev = 0);

// Solo percorsi dentro /polpo, senza "..", con caratteri semplici, max 96 caratteri.
bool valid_sd_path(const std::string& path);
// I file in /polpo/badusb sono script per la tastiera: scriverli richiede conferma sul Polpo.
bool is_sensitive_path(const std::string& path);

}  // namespace link
}  // namespace polpo
