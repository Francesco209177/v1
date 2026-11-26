/// Porta d'ingresso della versione portabile: tutto ciò che il guscio (Android) o uno strumento
/// (Linux) può chiedere al gioco. Le funzioni `marea_*` sono quelle chiamate dal ponte JNI in C.
public enum MareaHost {
    /// Avvia il gioco. `assets` contiene le cartelle `Data` e `Sprites`; in `saves` si può scrivere.
    public static func boot(assets: String, saves: String, width: Int, height: Int, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0) {
        App.shared.configure(deviceWidth: width, deviceHeight: height, left: left, top: top, right: right, bottom: bottom)
        App.shared.boot(assets: assets, saves: saves)
    }

    public static func resize(width: Int, height: Int, left: Int, top: Int, right: Int, bottom: Int) {
        App.shared.configure(deviceWidth: width, deviceHeight: height, left: left, top: top, right: right, bottom: bottom)
    }

    public static func frame(dt: Double) {
        App.shared.frame(dt: dt)
    }

    /// phase: 0 = giù, 1 = mosso, 2 = su, 3 = annullato. Coordinate in pixel dello schermo.
    public static func touch(id: Int, phase: Int, x: Double, y: Double) {
        let scale: Double = Double(App.shared.uiScale)
        App.shared.input.hostTouch(id: id, phase: phase, x: x / scale, y: y / scale)
    }

    public static func back() {
        App.shared.input.hostBack()
    }

    /// Avvia la prova automatica: istantanee in `directory`.
    public static func startSmoke(directory: String) {
        App.shared.smoke = SmokeRun(directory: directory)
    }

    public static var smokeFinished: Bool {
        return App.shared.smoke?.finished ?? false
    }

    public static func saveSnapshot(to path: String) -> Bool {
        return App.shared.saveSnapshot(to: path)
    }

    public static func setLog(_ sink: @escaping (String) -> Void) {
        Log.sink = sink
    }

    public static func renderAudio(into out: UnsafeMutablePointer<Int16>, frames: Int) {
        Mixer.shared.render(into: out, frames: frames)
    }
}

// MARK: - Funzioni C per il ponte JNI

private var logHook: (@convention(c) (UnsafePointer<CChar>) -> Void)? = nil

@_cdecl("marea_set_log")
public func mareaSetLog(_ hook: (@convention(c) (UnsafePointer<CChar>) -> Void)?) {
    logHook = hook
    if hook == nil {
        Log.sink = nil
    } else {
        Log.sink = { (text: String) -> Void in
            text.withCString { (pointer: UnsafePointer<CChar>) -> Void in logHook?(pointer) }
        }
    }
}

@_cdecl("marea_boot")
public func mareaBoot(_ assets: UnsafePointer<CChar>, _ saves: UnsafePointer<CChar>, _ width: Int32, _ height: Int32,
                      _ left: Int32, _ top: Int32, _ right: Int32, _ bottom: Int32) {
    MareaHost.boot(assets: String(cString: assets), saves: String(cString: saves), width: Int(width), height: Int(height),
                   left: Int(left), top: Int(top), right: Int(right), bottom: Int(bottom))
}

@_cdecl("marea_resize")
public func mareaResize(_ width: Int32, _ height: Int32, _ left: Int32, _ top: Int32, _ right: Int32, _ bottom: Int32) {
    MareaHost.resize(width: Int(width), height: Int(height), left: Int(left), top: Int(top), right: Int(right), bottom: Int(bottom))
}

@_cdecl("marea_frame")
public func mareaFrame(_ dt: Double) {
    App.shared.frame(dt: dt)
}

/// Cambia quando le tele sono state ricreate: il guscio deve richiedere di nuovo indirizzi e misure.
@_cdecl("marea_layout_version")
public func mareaLayoutVersion() -> Int32 {
    return Int32(App.shared.layoutVersion)
}

/// Tela `index` (0 = mondo, 1 = interfaccia): indirizzo dei pixel, RGBA premoltiplicato.
@_cdecl("marea_layer_pixels")
public func mareaLayerPixels(_ index: Int32) -> UnsafeMutableRawPointer {
    let canvas: Canvas = index == 0 ? App.shared.worldCanvas : App.shared.uiCanvas
    return UnsafeMutableRawPointer(canvas.buffer)
}

@_cdecl("marea_layer_width")
public func mareaLayerWidth(_ index: Int32) -> Int32 {
    return Int32(index == 0 ? App.shared.worldCanvas.width : App.shared.uiCanvas.width)
}

@_cdecl("marea_layer_height")
public func mareaLayerHeight(_ index: Int32) -> Int32 {
    return Int32(index == 0 ? App.shared.worldCanvas.height : App.shared.uiCanvas.height)
}

/// Pixel dello schermo per pixel della tela.
@_cdecl("marea_layer_scale")
public func mareaLayerScale(_ index: Int32) -> Int32 {
    return Int32(index == 0 ? App.shared.worldScale : App.shared.uiScale)
}

@_cdecl("marea_touch")
public func mareaTouch(_ id: Int32, _ phase: Int32, _ x: Float, _ y: Float) {
    MareaHost.touch(id: Int(id), phase: Int(phase), x: Double(x), y: Double(y))
}

/// Stato del controller: levette (y verso l'alto), croce, tasti come maschera di bit nell'ordine di `PadButton.allCases`.
@_cdecl("marea_pad")
public func mareaPad(_ connected: Int32, _ lx: Float, _ ly: Float, _ rx: Float, _ ry: Float, _ dpadX: Int32, _ dpadY: Int32, _ buttons: Int32) {
    var state: PadState = PadState()
    state.connected = connected != 0
    state.move = Vec2(Double(lx), Double(ly))
    state.aim = Vec2(Double(rx), Double(ry))
    state.dpadX = Int(dpadX)
    state.dpadY = Int(dpadY)
    var bit: Int = 0
    for button in PadButton.allCases {
        if (Int(buttons) >> bit) & 1 == 1 { state.buttons.insert(button) }
        bit += 1
    }
    App.shared.input.pad = state
}

@_cdecl("marea_back")
public func mareaBack() {
    App.shared.input.hostBack()
}

/// Vibrazione chiesta dall'ultimo fotogramma: 0 nessuna, 1 leggera ... 5 avviso.
@_cdecl("marea_haptic")
public func mareaHaptic() -> Int32 {
    return Int32(App.shared.hapticRequest)
}

@_cdecl("marea_quit_requested")
public func mareaQuitRequested() -> Int32 {
    let wanted: Bool = App.shared.quitRequested
    App.shared.quitRequested = false
    return wanted ? 1 : 0
}

@_cdecl("marea_audio")
public func mareaAudio(_ out: UnsafeMutablePointer<Int16>, _ frames: Int32) {
    Mixer.shared.render(into: out, frames: Int(frames))
}

/// L'app va in secondo piano: salva e zittisce.
@_cdecl("marea_pause")
public func mareaPause() {
    GameSession.shared.save()
    Mixer.shared.silence()
    App.shared.input.reset()
}

@_cdecl("marea_smoke_start")
public func mareaSmokeStart(_ directory: UnsafePointer<CChar>) {
    MareaHost.startSmoke(directory: String(cString: directory))
}

@_cdecl("marea_smoke_finished")
public func mareaSmokeFinished() -> Int32 {
    return MareaHost.smokeFinished ? 1 : 0
}
