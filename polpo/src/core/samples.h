// Polpo — file di esempio copiati sulla microSD al primo avvio (se mancano).
// Il contenuto viene da sd_template/ ed è incorporato nel firmware in fase di build.
#pragma once

#include <vector>

namespace samples {

struct Sample {
    const char* path;     // percorso sulla microSD
    const char* content;  // testo (terminato da \0)
};

const std::vector<Sample>& all();

}  // namespace samples
