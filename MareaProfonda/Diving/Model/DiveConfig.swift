/// Parametri di un'immersione: mappa del giorno, ora, attrezzatura. Li prepara la partita
/// (`GameSession.diveConfig`) e li legge la scena, su iPhone come su Android.
struct DiveConfig {
    /// Seme della mappa: slot, giorno e fascia oraria combinati.
    var seed: UInt64 = 1
    /// Profondità di partenza in metri (0 = dalla barca).
    var startDepthMeters: Double = 0
    var sky: BackdropPainter.SkyStyle = BackdropPainter.SkyStyle.morning
    var night: Bool = false
    /// Comandi imposti dalla prova automatica: direzione di nuoto e tiro continuo.
    var autopilot: Vec2? = nil
    var autoFire: Bool = false
    // Attrezzatura (valori di partenza; la partita li sostituisce con i potenziamenti).
    var breathMax: Double = 120
    var maxSafeDepth: Double = 110
    var bagWeight: Double = 10
    var harpoonDamage: Double = 10
    var harpoonRange: Double = 150
    var swimSpeed: Double = 66
    /// Raggio della luce attorno a Tecla nel buio, in frazione dell'altezza dello schermo.
    var torchRadius: Double = 0.10
    var weapon: WeaponInfo? = nil
    /// Nome della fase del giorno, mostrato accanto alla zona.
    var phaseLabel: String = ""
    /// Se valorizzato l'immersione è uno scontro: si comincia nella sala di questo boss.
    var boss: BossInfo? = nil
    /// Zone in cui può esserci una maiolica da collezione.
    var relicZones: [(index: Int, from: Double, to: Double)] = []
}
