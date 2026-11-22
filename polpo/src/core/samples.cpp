#include "core/samples.h"

// Simboli creati da board_build.embed_txtfiles (vedi platformio.ini).
#define POLPO_EMBED(sym) extern const char sym[] asm("_binary_" #sym "_start")

POLPO_EMBED(sd_template_polpo_LEGGIMI_txt);
POLPO_EMBED(sd_template_polpo_badusb_ciao_windows_txt);
POLPO_EMBED(sd_template_polpo_badusb_ciao_mac_txt);
POLPO_EMBED(sd_template_polpo_badusb_ciao_linux_txt);
POLPO_EMBED(sd_template_polpo_ir_esempio_tv_ir);

namespace samples {

const std::vector<Sample>& all() {
    static const std::vector<Sample> list = {
        {"/polpo/LEGGIMI.txt", sd_template_polpo_LEGGIMI_txt},
        {"/polpo/badusb/ciao_windows.txt", sd_template_polpo_badusb_ciao_windows_txt},
        {"/polpo/badusb/ciao_mac.txt", sd_template_polpo_badusb_ciao_mac_txt},
        {"/polpo/badusb/ciao_linux.txt", sd_template_polpo_badusb_ciao_linux_txt},
        {"/polpo/ir/esempio_tv.ir", sd_template_polpo_ir_esempio_tv_ir},
    };
    return list;
}

}  // namespace samples
