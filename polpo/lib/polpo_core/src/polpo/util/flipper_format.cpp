#include "polpo/util/flipper_format.h"

#include "polpo/util/strutil.h"

namespace polpo {

bool ff_parse(const std::string& text, FfDoc& out, std::string& err) {
    out = FfDoc{};
    size_t pos = 0;
    uint16_t line_no = 0;
    bool have_type = false, have_version = false;
    while (pos <= text.size()) {
        size_t nl = text.find('\n', pos);
        if (nl == std::string::npos) nl = text.size();
        std::string raw = text.substr(pos, nl - pos);
        pos = nl + 1;
        ++line_no;
        std::string line = trim(raw);
        if (line.empty() || line[0] == '#') {
            if (nl >= text.size()) break;
            continue;
        }
        size_t colon = line.find(':');
        if (colon == std::string::npos || colon == 0) {
            err = "riga " + std::to_string(line_no) + ": manca ':'";
            return false;
        }
        FfLine l;
        l.key = trim(line.substr(0, colon));
        l.value = trim(line.substr(colon + 1));
        l.line_no = line_no;
        if (!have_type) {
            if (l.key != "Filetype") {
                err = "manca l'intestazione Filetype";
                return false;
            }
            out.filetype = l.value;
            have_type = true;
        } else if (!have_version) {
            if (l.key != "Version" || !parse_u32(l.value, out.version)) {
                err = "manca o non valida l'intestazione Version";
                return false;
            }
            have_version = true;
        } else {
            out.lines.push_back(l);
        }
        if (nl >= text.size()) break;
    }
    if (!have_type || !have_version) {
        err = "file vuoto o senza intestazione";
        return false;
    }
    return true;
}

std::string ff_line(const std::string& key, const std::string& value) { return key + ": " + value + "\n"; }

std::string ff_header(const std::string& filetype, uint32_t version) {
    return ff_line("Filetype", filetype) + ff_line("Version", std::to_string(version));
}

}  // namespace polpo
