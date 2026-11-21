#include "hal/ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>

#include <algorithm>

namespace ble {
namespace {

bool inited = false;
NimBLEServer* server = nullptr;
NimBLEHIDDevice* hid = nullptr;
NimBLECharacteristic* input = nullptr;

// Report map HID: un solo report "Consumer Control" a 16 bit (ID 1).
const uint8_t kReportMap[] = {
    0x05, 0x0C,        // Usage Page (Consumer)
    0x09, 0x01,        // Usage (Consumer Control)
    0xA1, 0x01,        // Collection (Application)
    0x85, 0x01,        //   Report ID (1)
    0x15, 0x00,        //   Logical Minimum (0)
    0x26, 0xFF, 0x03,  //   Logical Maximum (1023)
    0x19, 0x00,        //   Usage Minimum (0)
    0x2A, 0xFF, 0x03,  //   Usage Maximum (1023)
    0x75, 0x10,        //   Report Size (16)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x00,        //   Input (Data, Array)
    0xC0,              // End Collection
};

bool ensure_init(const char* name) {
    if (inited) return true;
    inited = NimBLEDevice::init(name);
    return inited;
}

class ServerCallbacks : public NimBLEServerCallbacks {
    void onDisconnect(NimBLEServer* s, NimBLEConnInfo&, int) override { NimBLEDevice::startAdvertising(); }
};

}  // namespace

bool scan_start(uint32_t ms) {
    if (!ensure_init("Polpo")) return false;
    NimBLEScan* scan = NimBLEDevice::getScan();
    scan->setActiveScan(true);
    scan->setInterval(100);
    scan->setWindow(99);
    scan->setMaxResults(80);
    scan->clearResults();
    return scan->start(ms, false, true);
}

bool scanning() { return inited && NimBLEDevice::getScan()->isScanning(); }

std::vector<Device> scan_results() {
    std::vector<Device> out;
    if (!inited) return out;
    NimBLEScanResults res = NimBLEDevice::getScan()->getResults();
    for (int i = 0; i < res.getCount(); ++i) {
        const NimBLEAdvertisedDevice* d = res.getDevice(i);
        if (!d) continue;
        Device x;
        x.name = d->haveName() ? d->getName() : "";
        x.addr = d->getAddress().toString();
        x.rssi = d->getRSSI();
        x.connectable = d->isConnectable();
        x.services = d->getServiceUUIDCount();
        if (d->haveManufacturerData()) {
            const std::string m = d->getManufacturerData();
            if (m.size() >= 2) {
                x.has_mfr = true;
                x.mfr_id = static_cast<uint16_t>(static_cast<uint8_t>(m[0]) | (static_cast<uint8_t>(m[1]) << 8));
            }
        }
        out.push_back(x);
    }
    std::sort(out.begin(), out.end(), [](const Device& a, const Device& b) { return a.rssi > b.rssi; });
    return out;
}

bool remote_begin(const char* name) {
    if (!ensure_init(name)) return false;
    if (server) return true;
    NimBLEDevice::setSecurityAuth(true, false, true);  // abbinamento "just works" con bonding
    server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());
    hid = new NimBLEHIDDevice(server);
    input = hid->getInputReport(1);
    hid->setManufacturer("Polpo");
    hid->setPnp(0x02, 0x303A, 0x8001, 0x0100);
    hid->setHidInfo(0x00, 0x01);
    hid->setReportMap(const_cast<uint8_t*>(kReportMap), sizeof(kReportMap));
    hid->setBatteryLevel(100);
    server->start();
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->setAppearance(0x03C0);  // dispositivo HID generico
    adv->addServiceUUID(hid->getHidService()->getUUID());
    adv->setName(name);
    adv->enableScanResponse(true);
    return adv->start();
}

bool remote_connected() { return server && server->getConnectedCount() > 0; }

void remote_press(uint16_t usage) {
    if (!remote_connected() || !input) return;
    uint8_t v[2] = {static_cast<uint8_t>(usage & 0xFF), static_cast<uint8_t>(usage >> 8)};
    input->setValue(v, 2);
    input->notify();
    delay(30);
    uint8_t zero[2] = {0, 0};
    input->setValue(zero, 2);
    input->notify();
}

void end() {
    if (!inited) return;
    if (NimBLEDevice::getScan()->isScanning()) NimBLEDevice::getScan()->stop();
    delete hid;  // deinit() libera server e pubblicità, non l'oggetto HID
    hid = nullptr;
    NimBLEDevice::deinit(true);
    inited = false;
    server = nullptr;  // liberati da deinit(true)
    hid = nullptr;
    input = nullptr;
}

}  // namespace ble
