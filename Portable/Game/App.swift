/// Una schermata del gioco nella versione portabile. Disegna su due livelli: il mondo (pixel grossi,
/// la cui grandezza dipende dalla scena) e l'interfaccia (sopra, trasparente dove non c'è nulla).
class Screen {
    /// Altezza visibile desiderata per il mondo, in pixel d'arte: 240 in mare, meno negli interni.
    var worldHeight: Double { return 240 }

    func enter(_ app: App) {}
    func leave(_ app: App) {}
    /// Lettura dei tocchi da parte dei comandi a schermo (joystick, pulsanti): avviene prima che
    /// le azioni di gioco del fotogramma vengano calcolate.
    func controls(_ app: App) {}
    func update(_ app: App, _ dt: Double) {}
    func drawWorld(_ app: App, _ g: Canvas) {}
    func drawUI(_ app: App, _ ui: UI) {}

    /// Tasto "indietro". Ritorna true se la schermata lo ha gestito.
    func back(_ app: App) -> Bool { return false }

    /// L'app va in secondo piano (telefonata, tasto home): le schermate di gioco si mettono in pausa.
    func suspend(_ app: App) {}
}

/// Riscontro sonoro e tattile: stessi nomi dell'app iOS.
enum Feedback {
    private static func buzz(_ kind: Int) {
        if SettingsStore.shared.settings.haptics && App.shared.smoke == nil { App.shared.hapticRequest = kind }
    }

    /// Tocco leggero: pulsanti, bolle, piccoli urti.
    static func tap(sound: SFXKind? = SFXKind.tap) {
        if let sound: SFXKind = sound { Mixer.shared.play(sound, volume: 0.55) }
        buzz(1)
    }

    /// Colpo andato a segno, scatto.
    static func hit(sound: SFXKind? = SFXKind.hit) {
        if let sound: SFXKind = sound { Mixer.shared.play(sound, volume: 0.8) }
        buzz(2)
    }

    /// Urto forte, danno subito.
    static func thud(sound: SFXKind? = SFXKind.thud) {
        if let sound: SFXKind = sound { Mixer.shared.play(sound) }
        buzz(3)
    }

    /// Cattura riuscita, obiettivo raggiunto.
    static func success(sound: SFXKind? = SFXKind.success) {
        if let sound: SFXKind = sound { Mixer.shared.play(sound, volume: 0.8) }
        buzz(4)
    }

    /// Avviso: fiato basso, carico eccessivo.
    static func warning(sound: SFXKind? = SFXKind.warning) {
        if let sound: SFXKind = sound { Mixer.shared.play(sound, volume: 0.7) }
        buzz(5)
    }
}

/// Il gioco nella versione portabile: tiene le due tele, i comandi, la schermata in corso e il passaggio
/// a bolle tra una schermata e l'altra. Il guscio (Android, o lo strumento su Linux) gli passa tocchi e
/// tempo, e ne legge le tele a ogni fotogramma.
final class App {
    static let shared: App = App()

    let input: Input = Input()
    private(set) var deviceWidth: Int = 1280
    private(set) var deviceHeight: Int = 720
    /// Pixel dello schermo per pixel dell'interfaccia e del mondo.
    private(set) var uiScale: Int = 3
    private(set) var worldScale: Int = 3
    private(set) var uiCanvas: Canvas = Canvas(width: 427, height: 240)
    private(set) var worldCanvas: Canvas = Canvas(width: 427, height: 240)
    private(set) var ui: UI
    /// Cambia ogni volta che una tela viene ricreata: il guscio deve rileggerne indirizzo e misure.
    private(set) var layoutVersion: Int = 1
    /// Area libera da tacche e bordi curvi, in pixel dell'interfaccia.
    private(set) var safe: Rect = Rect(0, 0, 427, 240)
    private var insets: (left: Int, top: Int, right: Int, bottom: Int) = (left: 0, top: 0, right: 0, bottom: 0)

    private(set) var screen: Screen = Screen()
    private(set) var time: Double = 0
    private(set) var frameCount: Int = 0
    private(set) var booted: Bool = false

    /// Vibrazione chiesta in questo fotogramma (0 = nessuna): la legge il guscio.
    var hapticRequest: Int = 0
    /// Il gioco chiede di chiudere l'app (tasto indietro dal titolo).
    var quitRequested: Bool = false
    /// Prova automatica in corso, se c'è.
    var smoke: SmokeRun? = nil

    // Passaggio a bolle.
    private enum Wipe {
        case none
        case cover(Double)
        case reveal(Double)
    }
    private var wipe: Wipe = Wipe.none
    private var next: Screen? = nil
    private var afterSwap: (() -> Void)? = nil
    private var bubbles: [(x: Double, y: Double, radius: Double, speed: Double, drift: Double)] = []

    private init() {
        ui = UI(canvas: uiCanvas, input: input)
        ui.onClick = { () -> Void in Feedback.tap() }
    }

    var uiWidth: Int { return uiCanvas.width }
    var uiHeight: Int { return uiCanvas.height }
    var isChanging: Bool {
        if case Wipe.none = wipe { return false }
        return true
    }

    // MARK: Avvio e misure

    /// Dimensioni dello schermo in pixel e margini da lasciare liberi (tacca, angoli).
    func configure(deviceWidth w: Int, deviceHeight h: Int, left: Int, top: Int, right: Int, bottom: Int) {
        let width: Int = max(w, 160)
        let height: Int = max(h, 120)
        if width == deviceWidth && height == deviceHeight && insets == (left: left, top: top, right: right, bottom: bottom) && booted { return }
        deviceWidth = width
        deviceHeight = height
        insets = (left: left, top: top, right: right, bottom: bottom)
        uiScale = max(1, height / 240)
        uiCanvas = Canvas(width: (width + uiScale - 1) / uiScale, height: (height + uiScale - 1) / uiScale)
        ui.g = uiCanvas
        let l: Int = (left + uiScale - 1) / uiScale
        let t: Int = (top + uiScale - 1) / uiScale
        let r: Int = (right + uiScale - 1) / uiScale
        let b: Int = (bottom + uiScale - 1) / uiScale
        safe = Rect(l, t, max(40, uiCanvas.width - l - r), max(40, uiCanvas.height - t - b))
        resizeWorld(for: screen)
        layoutVersion += 1
    }

    private func resizeWorld(for target: Screen) {
        let scale: Int = max(1, Int(Double(deviceHeight) / max(target.worldHeight, 60)))
        let w: Int = (deviceWidth + scale - 1) / scale
        let h: Int = (deviceHeight + scale - 1) / scale
        if scale != worldScale || w != worldCanvas.width || h != worldCanvas.height {
            worldScale = scale
            worldCanvas = Canvas(width: w, height: h)
            layoutVersion += 1
        }
    }

    /// Carica dati e sprite e mostra il titolo. `assets` contiene `Data` e `Sprites`; in `saves` si scrive.
    func boot(assets: String, saves: String) {
        if booted { return }
        booted = true
        GameEnvironment.dataDirectory = URL(fileURLWithPath: assets + "/Data", isDirectory: true)
        GameEnvironment.saveDirectory = URL(fileURLWithPath: saves + "/Salvataggi", isDirectory: true)
        let settingsPath: String = saves + "/impostazioni.json"
        GameEnvironment.readSettings = { () -> Data? in
            return FileManager.default.contents(atPath: settingsPath)
        }
        GameEnvironment.writeSettings = { (data: Data) -> Void in
            try? FileManager.default.createDirectory(atPath: saves, withIntermediateDirectories: true)
            try? data.write(to: URL(fileURLWithPath: settingsPath), options: Data.WritingOptions.atomic)
        }
        Sprites.shared.load(directory: assets + "/Sprites")
        PixelFont.shared.load()
        for problem in Sprites.shared.problems { Log.note("SPRITE \(problem)") }
        for problem in GameData.shared.problems { Log.note("DATI \(problem)") }
        Mixer.shared.start(dataDirectory: assets + "/Data")
        applySettings()
        go(TitleScreen(), animated: false)
    }

    /// Riporta volumi e rimappatura dalle preferenze ai motori.
    func applySettings() {
        let settings: GameSettings = SettingsStore.shared.settings
        Mixer.shared.setVolumes(music: settings.musicVolume, effects: settings.effectsVolume)
        input.mapping = settings.mapping
    }

    // MARK: Schermate

    /// Passa a un'altra schermata. Con `animated` uno sciame di bolle copre lo schermo durante il cambio.
    /// - Parameter then: chiamata appena la schermata nuova è al suo posto.
    func go(_ target: Screen, animated: Bool = true, then: (() -> Void)? = nil) {
        if animated && smoke == nil {
            if case Wipe.cover = wipe { return }
            next = target
            afterSwap = then
            wipe = Wipe.cover(0)
            input.reset()
            makeBubbles(count: 44, fromBelow: true)
        } else {
            swap(to: target)
            then?()
        }
    }

    private func swap(to target: Screen) {
        screen.leave(self)
        input.reset()
        screen = target
        resizeWorld(for: target)
        target.enter(self)
    }

    private func makeBubbles(count: Int, fromBelow: Bool) {
        var rng: SeededRNG = SeededRNG(seed: UInt64(frameCount) &+ 77)
        bubbles.removeAll(keepingCapacity: true)
        let w: Double = Double(uiCanvas.width)
        let h: Double = Double(uiCanvas.height)
        var i: Int = 0
        while i < count {
            let radius: Double = rng.range(6, 20)
            let y: Double = fromBelow ? h + 24 + rng.range(0, 0.55) * h : rng.range(0.1, 1.0) * h
            bubbles.append((x: rng.range(-0.05, 1.05) * w, y: y, radius: radius,
                            speed: (h * 1.25 + 60) / rng.range(0.48, 0.66), drift: rng.range(-18, 18)))
            i += 1
        }
    }

    private func drawWipe(_ g: Canvas) {
        let veil: RGBA = RGBA(hex: 0x0A335C)
        var alpha: Double = 0
        switch wipe {
        case .none:
            return
        case .cover(let t):
            alpha = MathUtil.clamp((t - 0.16) / 0.30, 0, 1)
        case .reveal(let t):
            alpha = MathUtil.clamp(1 - t / 0.42, 0, 1)
        }
        if alpha > 0 { g.fill(x: 0, y: 0, w: g.width, h: g.height, veil.withAlpha(UInt8(alpha * 255))) }
        for bubble in bubbles {
            let x: Int = Int(bubble.x.rounded())
            let y: Int = Int(bubble.y.rounded())
            let r: Int = Int(bubble.radius)
            if y + r < 0 || y - r > g.height { continue }
            g.disc(x, y, radius: r, RGBA(hex: 0xD6F6FC))
            g.disc(x, y, radius: r - 2, RGBA(hex: 0x60BED6))
            g.fill(x: x - r / 2, y: y - r / 2 - 1, w: max(2, r / 3), h: max(1, r / 6), RGBA(hex: 0xF0FCFF))
            g.fill(x: x - r / 2 - 1, y: y - r / 2, w: max(1, r / 6), h: max(2, r / 4), RGBA(hex: 0xF0FCFF))
        }
    }

    // MARK: Fotogramma

    /// Fa avanzare il gioco di `dt` secondi e ridisegna le due tele.
    func frame(dt rawDt: Double) {
        let dt: Double = min(max(rawDt, 0), 1.0 / 20.0)
        time += dt
        frameCount += 1
        hapticRequest = 0
        input.beginFrame(dt: dt)
        Mixer.shared.tick(dt)
        Mixer.shared.update()

        // Passaggio tra schermate.
        switch wipe {
        case .none:
            break
        case .cover(let t):
            let now: Double = t + dt
            if now >= 0.56, let target: Screen = next {
                next = nil
                swap(to: target)
                let done: (() -> Void)? = afterSwap
                afterSwap = nil
                done?()
                wipe = Wipe.reveal(0)
                makeBubbles(count: 30, fromBelow: false)
            } else {
                wipe = Wipe.cover(now)
            }
        case .reveal(let t):
            let now: Double = t + dt
            wipe = now >= 0.8 ? Wipe.none : Wipe.reveal(now)
        }
        var i: Int = 0
        while i < bubbles.count {
            bubbles[i].y -= bubbles[i].speed * dt
            bubbles[i].x += bubbles[i].drift * dt
            i += 1
        }

        var covering: Bool = false
        if case Wipe.cover = wipe { covering = true }
        if !covering { screen.controls(self) }
        input.resolve()
        if input.back && !covering {
            if !screen.back(self) { quitRequested = true }
        }
        smoke?.step(self, dt)
        if !covering { screen.update(self, dt) }

        screen.drawWorld(self, worldCanvas)
        uiCanvas.clear(RGBA.clear)
        uiCanvas.ox = 0
        uiCanvas.oy = 0
        uiCanvas.resetClip()
        ui.begin(dt: dt)
        if covering { ui.blocked = true }
        screen.drawUI(self, ui)
        ui.end()
        uiCanvas.ox = 0
        uiCanvas.oy = 0
        uiCanvas.resetClip()
        drawWipe(uiCanvas)
        if SettingsStore.shared.settings.showPerformance { drawPerformance(dt: rawDt) }
    }

    private var smoothedDt: Double = 1.0 / 60.0

    private func drawPerformance(dt: Double) {
        smoothedDt += (dt - smoothedDt) * 0.05
        let fps: Int = smoothedDt > 0 ? Int((1 / smoothedDt).rounded()) : 0
        let text: String = "\(fps) fps  \(worldCanvas.width)x\(worldCanvas.height)@\(worldScale)"
        let w: Int = PixelFont.shared.width(text) + 6
        uiCanvas.fill(x: safe.x + 2, y: safe.maxY - 13, w: w, h: 11, RGBA(r: 0, g: 0, b: 0, a: 150))
        uiCanvas.text(text, x: safe.x + 5, y: safe.maxY - 11, Theme.white)
    }

    // MARK: Conversioni

    /// Da pixel dell'interfaccia a pixel del mondo (stesso punto dello schermo).
    func worldFromUI(_ v: Double) -> Double {
        return v * Double(uiScale) / Double(worldScale)
    }

    func uiFromWorld(_ v: Double) -> Double {
        return v * Double(worldScale) / Double(uiScale)
    }

    // MARK: Istantanea

    /// Fonde le due tele alla risoluzione dello schermo: 3 byte per pixel.
    func snapshot() -> (width: Int, height: Int, rgb: [UInt8]) {
        let w: Int = deviceWidth
        let h: Int = deviceHeight
        var rgb: [UInt8] = [UInt8](repeating: 0, count: w * h * 3)
        var y: Int = 0
        while y < h {
            let wy: Int = min(y / worldScale, worldCanvas.height - 1)
            let uy: Int = min(y / uiScale, uiCanvas.height - 1)
            var x: Int = 0
            while x < w {
                let below: Pixel = worldCanvas.buffer[wy * worldCanvas.width + min(x / worldScale, worldCanvas.width - 1)]
                let above: Pixel = uiCanvas.buffer[uy * uiCanvas.width + min(x / uiScale, uiCanvas.width - 1)]
                let p: Pixel = Pack.over(above, below | 0xFF00_0000)
                let o: Int = (y * w + x) * 3
                rgb[o] = UInt8(p & 0xFF)
                rgb[o + 1] = UInt8((p >> 8) & 0xFF)
                rgb[o + 2] = UInt8((p >> 16) & 0xFF)
                x += 1
            }
            y += 1
        }
        return (width: w, height: h, rgb: rgb)
    }

    /// Salva l'istantanea in PNG.
    @discardableResult
    func saveSnapshot(to path: String) -> Bool {
        let shot: (width: Int, height: Int, rgb: [UInt8]) = snapshot()
        let bytes: [UInt8] = PNG.encode(width: shot.width, height: shot.height, rgb: shot.rgb)
        do {
            try Data(bytes).write(to: URL(fileURLWithPath: path))
            return true
        } catch {
            Log.note("istantanea non salvata: \(path)")
            return false
        }
    }
}
