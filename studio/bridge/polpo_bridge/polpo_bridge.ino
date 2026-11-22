// Polpo Bridge — trasforma una scheda Arduino (Uno/Nano) o ESP32 in un "ponte" per Polpo Studio:
// pin digitali, ADC, scansione I2C e bus 1-Wire (iButton, sensori) comandati dal PC via USB.
//
// Protocollo: una riga JSON per richiesta e per risposta, a 115200 baud, come Polpo Link:
//   {"id":1,"cmd":"pin.read","args":{"pin":5}}  ->  {"id":1,"ok":true,"data":{"value":1}}
//
// Sicurezza: solo i pin elencati in kPins sono utilizzabili (esclusi seriale, flash e pin di avvio);
// un pin scrive solo se prima è stato impostato come uscita. Polpo Studio chiede comunque la
// modalità laboratorio e una conferma prima di ogni uscita.
//
// Librerie (Gestore librerie di Arduino IDE): ArduinoJson 7.x di Benoit Blanchon, OneWire di Paul Stoffregen.
// Licenza MIT, come il resto del progetto Polpo.

#include <ArduinoJson.h>
#include <OneWire.h>
#include <Wire.h>

#define BRIDGE_VERSION "0.1.0"

#if defined(ARDUINO_ARCH_AVR)
static const char* kBoard = "Arduino AVR (5 V)";
static const uint8_t kPins[] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, A0, A1, A2, A3};
static const uint8_t kAdc[] = {A0, A1, A2, A3, A6, A7};
static const uint8_t kOneWirePin = 4;
static const uint8_t kAdcBits = 10;
#elif defined(ARDUINO_ARCH_ESP32) && defined(CONFIG_IDF_TARGET_ESP32S3)
static const char* kBoard = "ESP32-S3 (3,3 V)";
static const uint8_t kPins[] = {1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21};
static const uint8_t kAdc[] = {1, 2, 4, 5, 6, 7, 8, 9, 10};
static const uint8_t kOneWirePin = 4;
static const uint8_t kAdcBits = 12;
#elif defined(ARDUINO_ARCH_ESP32)
static const char* kBoard = "ESP32 (3,3 V)";
// Esclusi: 0/2/12/15 (avvio), 1/3 (seriale USB), 6-11 (memoria flash). 34-39 solo ingressi.
static const uint8_t kPins[] = {4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
static const uint8_t kAdc[] = {32, 33, 34, 35, 36, 39};
static const uint8_t kOneWirePin = 4;
static const uint8_t kAdcBits = 12;
#else
#error "Polpo Bridge supporta per ora Arduino AVR (Uno/Nano), ESP32 ed ESP32-S3"
#endif

#if defined(ARDUINO_ARCH_AVR)
static const size_t kMaxLine = 128;  // l'Uno ha solo 2 KB di RAM
#else
static const size_t kMaxLine = 256;
#endif
static OneWire ow(kOneWirePin);
static char line[kMaxLine + 1];
static size_t lineLen = 0;
static bool overflow = false;
static uint8_t outputs[8] = {0};  // bit per pin impostati come uscita (pin < 64)

template <size_t N>
static bool inList(const uint8_t (&list)[N], int pin) {
  for (size_t i = 0; i < N; ++i)
    if (list[i] == pin) return true;
  return false;
}

static bool isOutput(int pin) { return pin >= 0 && pin < 64 && (outputs[pin / 8] & (1 << (pin % 8))); }
static void setOutput(int pin, bool on) {
  if (pin < 0 || pin >= 64) return;
  if (on) outputs[pin / 8] |= (1 << (pin % 8));
  else outputs[pin / 8] &= ~(1 << (pin % 8));
}

static void sendDoc(JsonDocument& doc) {
  serializeJson(doc, Serial);
  Serial.write('\n');
}

static void replyError(uint32_t id, const char* code, const char* msg) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ok"] = false;
  doc["error"]["code"] = code;
  doc["error"]["msg"] = msg;
  sendDoc(doc);
}

// Una sola risposta in memoria: i dati si scrivono direttamente dentro "data".
static JsonObject beginOk(JsonDocument& resp, uint32_t id) {
  resp["id"] = id;
  resp["ok"] = true;
  return resp["data"].to<JsonObject>();
}

static void hexRom(const uint8_t* rom, char* out) {
  static const char digits[] = "0123456789ABCDEF";
  for (int i = 0; i < 8; ++i) {
    out[i * 3] = digits[rom[i] >> 4];
    out[i * 3 + 1] = digits[rom[i] & 0x0F];
    out[i * 3 + 2] = i == 7 ? '\0' : ' ';
  }
}

static void handle(JsonDocument& req) {
  if (!req["id"].is<uint32_t>()) return replyError(0, "bad_request", "manca un id numerico");
  const uint32_t id = req["id"];
  const char* cmd = req["cmd"] | "";
  JsonObjectConst args = req["args"].as<JsonObjectConst>();
  JsonDocument resp;
  JsonObject data = beginOk(resp, id);

  if (!strcmp(cmd, "ping")) {
    data["pong"] = true;
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "hello")) {
    data["bridge"] = "Polpo Bridge";
    data["version"] = BRIDGE_VERSION;
    data["proto"] = 1;
    data["board"] = kBoard;
    JsonArray pins = data["pins"].to<JsonArray>();
    for (uint8_t p : kPins) pins.add(p);
    JsonArray adc = data["adc"].to<JsonArray>();
    for (uint8_t p : kAdc) adc.add(p);
    data["onewire_pin"] = kOneWirePin;
    data["adc_bits"] = kAdcBits;
    return sendDoc(resp);
  }
  const int pin = args["pin"] | -1;
  if (!strcmp(cmd, "pin.mode")) {
    const char* mode = args["mode"] | "";
    if (!inList(kPins, pin)) return replyError(id, "denied", "pin non utilizzabile su questa scheda");
    if (!strcmp(mode, "input")) {
      pinMode(pin, INPUT);
      setOutput(pin, false);
    } else if (!strcmp(mode, "input_pullup")) {
      pinMode(pin, INPUT_PULLUP);
      setOutput(pin, false);
    } else if (!strcmp(mode, "output")) {
#if defined(ARDUINO_ARCH_ESP32) && !defined(CONFIG_IDF_TARGET_ESP32S3)
      if (pin >= 34) return replyError(id, "denied", "i pin 34-39 dell'ESP32 sono solo ingressi");
#endif
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);  // le uscite partono sempre spente
      setOutput(pin, true);
    } else {
      return replyError(id, "bad_args", "mode: input, input_pullup oppure output");
    }
    data["pin"] = pin;
    data["mode"] = mode;
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "pin.read")) {
    if (!inList(kPins, pin)) return replyError(id, "denied", "pin non utilizzabile su questa scheda");
    data["value"] = digitalRead(pin);
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "pin.write")) {
    if (!inList(kPins, pin)) return replyError(id, "denied", "pin non utilizzabile su questa scheda");
    if (!isOutput(pin)) return replyError(id, "denied", "imposta prima il pin come uscita (pin.mode)");
    const int value = args["value"] | 0;
    digitalWrite(pin, value ? HIGH : LOW);
    data["value"] = value ? 1 : 0;
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "adc.read")) {
    if (!inList(kAdc, pin)) return replyError(id, "denied", "pin senza ADC su questa scheda");
    data["raw"] = analogRead(pin);
    data["bits"] = kAdcBits;
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "i2c.scan")) {
    Wire.begin();
    JsonArray found = data["devices"].to<JsonArray>();
    for (uint8_t a = 0x08; a < 0x78; ++a) {
      Wire.beginTransmission(a);
      if (Wire.endTransmission() == 0) found.add(a);
    }
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "ow.reset")) {
    data["presence"] = ow.reset() == 1;
    return sendDoc(resp);
  }
  if (!strcmp(cmd, "ow.search")) {
    JsonArray roms = data["roms"].to<JsonArray>();
    uint8_t rom[8];
    char text[24];
    ow.reset_search();
    for (int n = 0; n < 16 && ow.search(rom); ++n) {
      hexRom(rom, text);
      JsonObject r = roms.add<JsonObject>();
      r["rom"] = text;
      r["crc_ok"] = OneWire::crc8(rom, 7) == rom[7];
    }
    return sendDoc(resp);
  }
  replyError(id, "unknown_cmd", "comando sconosciuto");
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c != '\n') {
      if (lineLen < kMaxLine) line[lineLen++] = c;
      else overflow = true;
      continue;
    }
    line[lineLen] = '\0';
    if (overflow) {
      replyError(0, "line_too_long", "riga troppo lunga");
    } else if (lineLen) {
      JsonDocument req;
      if (deserializeJson(req, line, lineLen, DeserializationOption::NestingLimit(4))) replyError(0, "bad_json", "JSON non valido");
      else handle(req);
    }
    lineLen = 0;
    overflow = false;
  }
}
