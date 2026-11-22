#include "core/storage.h"

#include <FS.h>
#include <SD.h>
#include <SPI.h>

#include <algorithm>

#include "board_pins.h"
#include "core/samples.h"

namespace storage {
namespace {

bool g_ok = false;

bool has_ext(const std::string& name, const char* ext) {
    if (!ext || !*ext) return true;
    const std::string e(ext);
    if (name.size() < e.size()) return false;
    std::string tail = name.substr(name.size() - e.size());
    std::transform(tail.begin(), tail.end(), tail.begin(), ::tolower);
    return tail == e;
}

}  // namespace

bool begin() {
    SPI.begin(pins::kSdSck, pins::kSdMiso, pins::kSdMosi, pins::kSdCs);
    g_ok = SD.begin(pins::kSdCs, SPI, 25000000);
    if (g_ok) ensure_layout();
    return g_ok;
}

bool ok() { return g_ok; }

bool retry() {
    SD.end();
    return begin();
}

bool list(const std::string& dir, std::vector<Entry>& out, const char* ext) {
    out.clear();
    if (!g_ok) return false;
    File d = SD.open(dir.c_str());
    if (!d || !d.isDirectory()) return false;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        Entry e;
        e.name = basename(f.name());
        e.dir = f.isDirectory();
        e.size = e.dir ? 0 : static_cast<uint32_t>(f.size());
        f.close();
        if (e.name.empty() || e.name[0] == '.') continue;
        if (!e.dir && !has_ext(e.name, ext)) continue;
        out.push_back(e);
        if (out.size() >= 300) break;
    }
    d.close();
    std::sort(out.begin(), out.end(), [](const Entry& a, const Entry& b) {
        if (a.dir != b.dir) return a.dir;
        return a.name < b.name;
    });
    return true;
}

bool read_text(const std::string& path, std::string& out, size_t max_bytes) {
    out.clear();
    if (!g_ok) return false;
    File f = SD.open(path.c_str(), FILE_READ);
    if (!f || f.isDirectory()) return false;
    const size_t n = f.size();
    if (n > max_bytes) {
        f.close();
        return false;
    }
    out.resize(n);
    const size_t got = f.read(reinterpret_cast<uint8_t*>(&out[0]), n);
    f.close();
    out.resize(got);
    return got == n;
}

bool write_text(const std::string& path, const std::string& data) {
    if (!g_ok) return false;
    const std::string tmp = path + ".tmp";
    File f = SD.open(tmp.c_str(), FILE_WRITE);
    if (!f) return false;
    const size_t w = f.write(reinterpret_cast<const uint8_t*>(data.data()), data.size());
    f.close();
    if (w != data.size()) {
        SD.remove(tmp.c_str());
        return false;
    }
    if (SD.exists(path.c_str())) SD.remove(path.c_str());
    return SD.rename(tmp.c_str(), path.c_str());
}

bool append_text(const std::string& path, const std::string& data) {
    if (!g_ok) return false;
    File f = SD.open(path.c_str(), FILE_APPEND);
    if (!f) return false;
    const size_t w = f.write(reinterpret_cast<const uint8_t*>(data.data()), data.size());
    f.close();
    return w == data.size();
}

bool exists(const std::string& path) { return g_ok && SD.exists(path.c_str()); }

bool remove(const std::string& path) { return g_ok && SD.remove(path.c_str()); }

bool mkdirs(const std::string& path) {
    if (!g_ok) return false;
    std::string cur;
    size_t i = 0;
    while (i <= path.size()) {
        size_t slash = path.find('/', i + 1);
        if (slash == std::string::npos) slash = path.size();
        cur = path.substr(0, slash);
        if (!cur.empty() && !SD.exists(cur.c_str())) SD.mkdir(cur.c_str());
        i = slash;
        if (slash >= path.size()) break;
    }
    return SD.exists(path.c_str());
}

std::string basename(const std::string& path) {
    const size_t s = path.find_last_of('/');
    return s == std::string::npos ? path : path.substr(s + 1);
}

std::string join(const std::string& dir, const std::string& name) {
    if (dir.empty() || dir.back() == '/') return dir + name;
    return dir + "/" + name;
}

std::string unique_path(const std::string& dir, const std::string& base, const std::string& ext) {
    std::string p = join(dir, base + ext);
    for (int i = 2; exists(p) && i < 1000; ++i) p = join(dir, base + "_" + std::to_string(i) + ext);
    return p;
}

uint64_t total_bytes() { return g_ok ? SD.totalBytes() : 0; }
uint64_t used_bytes() { return g_ok ? SD.usedBytes() : 0; }

void ensure_layout() {
    for (const char* d : {kRoot, kIrDir, kBadUsbDir, kRfDir, kNfcDir, kLogDir}) mkdirs(d);
    for (const auto& s : samples::all()) {
        const std::string p = s.path;
        if (!exists(p)) write_text(p, s.content);
    }
}

}  // namespace storage
