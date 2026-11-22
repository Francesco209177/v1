#include "polpo/ducky/ducky.h"

#include "polpo/util/strutil.h"
#include "polpo/util/utf8.h"

namespace polpo {
namespace {

using namespace hid;

struct Named {
    const char* name;
    uint8_t key;
};

const Named kNamedKeys[] = {
    {"ENTER", kKeyEnter},        {"ESC", kKeyEsc},           {"ESCAPE", kKeyEsc},
    {"TAB", kKeyTab},            {"SPACE", kKeySpace},       {"BACKSPACE", kKeyBackspace},
    {"DELETE", kKeyDelete},      {"DEL", kKeyDelete},        {"INSERT", kKeyInsert},
    {"HOME", kKeyHome},          {"END", kKeyEnd},           {"PAGEUP", kKeyPageUp},
    {"PAGEDOWN", kKeyPageDown},  {"UP", kKeyUp},             {"UPARROW", kKeyUp},
    {"DOWN", kKeyDown},          {"DOWNARROW", kKeyDown},    {"LEFT", kKeyLeft},
    {"LEFTARROW", kKeyLeft},     {"RIGHT", kKeyRight},       {"RIGHTARROW", kKeyRight},
    {"CAPSLOCK", kKeyCapsLock},  {"NUMLOCK", kKeyNumLock},   {"SCROLLLOCK", kKeyScrollLock},
    {"PRINTSCREEN", kKeyPrintScreen}, {"PAUSE", kKeyPause},  {"BREAK", kKeyPause},
    {"MENU", kKeyApplication},   {"APP", kKeyApplication},
};

const Named kModifiers[] = {
    {"CTRL", kModLCtrl},   {"CONTROL", kModLCtrl}, {"SHIFT", kModLShift}, {"ALT", kModLAlt},
    {"ALTGR", kModRAlt},   {"GUI", kModLGui},      {"WINDOWS", kModLGui}, {"COMMAND", kModLGui},
};

bool named_key(const std::string& up, uint8_t& key) {
    for (const auto& n : kNamedKeys)
        if (up == n.name) {
            key = n.key;
            return true;
        }
    if (up.size() >= 2 && up[0] == 'F') {
        uint32_t f;
        if (parse_u32(up.substr(1), f) && f >= 1 && f <= 12) {
            key = static_cast<uint8_t>(kKeyF1 + f - 1);
            return true;
        }
    }
    return false;
}

bool modifier(const std::string& up, uint8_t& mod) {
    for (const auto& m : kModifiers)
        if (up == m.name) {
            mod = m.key;
            return true;
        }
    return false;
}

// Divide una riga di combinazione su spazi e trattini ("CTRL-ALT DELETE").
std::vector<std::string> combo_tokens(const std::string& line) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : line) {
        if (c == ' ' || c == '\t' || (c == '-' && !cur.empty())) {
            if (!cur.empty()) out.push_back(cur);
            cur.clear();
        } else {
            cur.push_back(c);
        }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

class Parser {
public:
    Parser(KbLayout layout, DuckyScript& out) : layout_(layout), out_(out) {}

    void line(uint16_t no, const std::string& raw) {
        line_no_ = no;
        std::string l = trim(raw);
        if (l.empty()) return;
        const size_t sp = l.find_first_of(" \t");
        const std::string cmd = to_upper_ascii(sp == std::string::npos ? l : l.substr(0, sp));
        const std::string arg = sp == std::string::npos ? std::string() : l.substr(sp + 1);

        if (cmd == "REM" || cmd == "//") return;
        if (cmd == "DEFAULT_DELAY" || cmd == "DEFAULTDELAY") {
            uint32_t v;
            if (!parse_u32(trim(arg), v) || v > 10000) return error("DEFAULT_DELAY richiede un numero 0-10000");
            default_delay_ = v;
            return;
        }
        if (cmd == "REPEAT") {
            uint32_t n;
            if (!parse_u32(trim(arg), n) || n == 0 || n > kDuckyMaxRepeat)
                return error("REPEAT richiede un numero 1-500");
            if (last_begin_ == last_end_) return error("REPEAT senza un comando precedente");
            for (uint32_t r = 0; r < n; ++r)
                for (size_t i = last_begin_; i < last_end_; ++i) {
                    if (!room()) return;
                    DuckyAction a = out_.actions[i];
                    a.line = no;
                    push(a);
                }
            return;
        }

        const size_t begin = out_.actions.size();
        if (cmd == "DELAY") {
            uint32_t v;
            if (!parse_u32(trim(arg), v) || v > kDuckyMaxDelayMs) return error("DELAY richiede un numero 0-60000");
            delay(v);
        } else if (cmd == "STRING" || cmd == "STRINGLN") {
            if (!text(arg)) return;
            if (cmd == "STRINGLN") key(0, kKeyEnter);
        } else if (!combo(l)) {
            return;
        }
        if (default_delay_ && cmd != "DELAY") delay(default_delay_);
        last_begin_ = begin;
        last_end_ = out_.actions.size();
    }

private:
    void error(const std::string& m) { out_.errors.push_back({line_no_, m}); }

    bool room() {
        if (out_.actions.size() >= kDuckyMaxActions) {
            if (!overflow_) error("script troppo lungo (max 1200 azioni)");
            overflow_ = true;
            return false;
        }
        return true;
    }

    void push(const DuckyAction& a) {
        if (!room()) return;
        if (a.type == DuckyActionType::Delay) out_.total_delay_ms += a.ms;
        if (a.type == DuckyActionType::Text) out_.total_chars += static_cast<uint32_t>(utf8_length(a.text));
        out_.actions.push_back(a);
    }

    void delay(uint32_t ms) {
        DuckyAction a;
        a.type = DuckyActionType::Delay;
        a.ms = ms;
        a.line = line_no_;
        push(a);
    }

    void key(uint8_t mods, uint8_t code) {
        DuckyAction a;
        a.type = DuckyActionType::Key;
        a.modifiers = mods;
        a.keycode = code;
        a.line = line_no_;
        push(a);
    }

    bool text(const std::string& s) {
        size_t i = 0;
        uint32_t cp;
        while (i < s.size()) {
            if (!utf8_next(s, i, cp)) {
                error("testo con caratteri UTF-8 non validi");
                return false;
            }
            KeyStroke ks;
            if (!layout_lookup(layout_, cp, ks)) {
                std::string ch;
                utf8_append(ch, cp);
                error("carattere '" + ch + "' non digitabile con layout " + layout_name(layout_));
                return false;
            }
        }
        DuckyAction a;
        a.type = DuckyActionType::Text;
        a.text = s;
        a.line = line_no_;
        push(a);
        return true;
    }

    bool combo(const std::string& l) {
        const auto toks = combo_tokens(l);
        uint8_t mods = 0, code = 0;
        for (size_t t = 0; t < toks.size(); ++t) {
            const std::string up = to_upper_ascii(toks[t]);
            uint8_t m;
            if (modifier(up, m)) {
                mods |= m;
                continue;
            }
            if (t + 1 != toks.size() || code) {
                error("comando sconosciuto: " + toks[t]);
                return false;
            }
            if (named_key(up, code)) continue;
            // Un singolo carattere (es. "GUI r"): si usa il tasto che lo produce.
            size_t i = 0;
            uint32_t cp;
            if (utf8_next(toks[t], i, cp) && i == toks[t].size()) {
                if (cp >= 'A' && cp <= 'Z') cp = cp - 'A' + 'a';
                KeyStroke ks;
                if (layout_lookup(layout_, cp, ks)) {
                    mods |= ks.modifiers;
                    code = ks.keycode;
                    continue;
                }
            }
            error("comando sconosciuto: " + toks[t]);
            return false;
        }
        if (toks.empty()) return false;
        key(mods, code);
        return true;
    }

    KbLayout layout_;
    DuckyScript& out_;
    uint16_t line_no_ = 0;
    uint32_t default_delay_ = 0;
    size_t last_begin_ = 0, last_end_ = 0;
    bool overflow_ = false;
};

}  // namespace

DuckyScript ducky_parse(const std::string& source, KbLayout layout) {
    DuckyScript out;
    if (source.size() > kDuckyMaxBytes) {
        out.errors.push_back({0, "file troppo grande (max 32 KB)"});
        return out;
    }
    Parser p(layout, out);
    size_t pos = 0;
    uint16_t no = 0;
    while (pos < source.size()) {
        size_t nl = source.find('\n', pos);
        if (nl == std::string::npos) nl = source.size();
        if (++no > kDuckyMaxLines) {
            out.errors.push_back({no, "troppe righe (max 2000)"});
            break;
        }
        p.line(no, source.substr(pos, nl - pos));
        pos = nl + 1;
    }
    out.line_count = no;
    return out;
}

}  // namespace polpo
