// Polpo Link — collegamento con Polpo Studio sulla porta seriale USB.
// I comandi girano solo dopo che l'utente ha accettato il collegamento sullo schermo del Polpo,
// mentre è aperta la schermata "Collegato al PC". Le operazioni sensibili chiedono conferma ogni volta.
#pragma once

#include <cstdint>

namespace pclink {

void begin();               // in setup(), dopo l'avvio di USB e microSD
void poll(uint32_t now_ms); // a ogni giro del loop, prima del ridisegno
bool session_active();
void on_link_screen_closed();  // chiamato dalla schermata quando l'utente scollega

}  // namespace pclink
