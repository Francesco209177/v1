/// Punto di vista su un mondo con la y verso l'alto (porto, scene della storia): converte in pixel della tela.
struct View2D {
    var centerX: Double
    var centerY: Double
    let width: Int
    let height: Int

    @inline(__always)
    func sx(_ x: Double) -> Int {
        return width / 2 + Int((x - centerX).rounded())
    }

    @inline(__always)
    func sy(_ y: Double) -> Int {
        return height / 2 - Int((y - centerY).rounded())
    }
}

/// Il porto di Pietrasale come fondale: cielo e isola, mare, banchina, facciata dell'osteria, gozzo.
/// Lo usano il porto vero e proprio e le scene della storia; la luce dipende dall'ora.
final class PortPaint {
    /// Quota a cui poggiano i piedi dei personaggi.
    static let groundY: Double = -52

    let phase: DayPhase
    private var sky: Image = Image.empty
    private var skyWidth: Int = 0
    private static var glow: Image = Image.empty

    init(phase: DayPhase) {
        self.phase = phase
    }

    static func skyStyle(_ phase: DayPhase) -> BackdropPainter.SkyStyle {
        switch phase {
        case .morning: return BackdropPainter.SkyStyle.morning
        case .afternoon: return BackdropPainter.SkyStyle.afternoon
        case .evening: return BackdropPainter.SkyStyle.evening
        case .night: return BackdropPainter.SkyStyle.night
        }
    }

    /// Colori del mare all'orizzonte e in primo piano.
    static func seaColors(_ phase: DayPhase) -> (top: RGBA, bottom: RGBA) {
        switch phase {
        case .morning: return (top: RGBA(hex: 0x58D6D0), bottom: RGBA(hex: 0x1F8FB0))
        case .afternoon: return (top: RGBA(hex: 0x4CC4D8), bottom: RGBA(hex: 0x1A78A8))
        case .evening: return (top: RGBA(hex: 0xF09A6A), bottom: RGBA(hex: 0x3A3A78))
        case .night: return (top: RGBA(hex: 0x1B2A55), bottom: RGBA(hex: 0x070B24))
        }
    }

    /// Velo colorato che dà la luce dell'ora.
    static func tint(_ phase: DayPhase) -> RGBA {
        switch phase {
        case .night: return RGBA(hex: 0x050A28, alpha: 107)
        case .evening: return RGBA(hex: 0x3A1A50, alpha: 41)
        case .morning, .afternoon: return RGBA.clear
        }
    }

    /// Alone caldo di una finestra accesa.
    static func glowImage() -> Image {
        if !glow.isEmpty { return glow }
        let size: Int = 70
        var image: PixelBuffer = PixelBuffer(width: size, height: size)
        let c: Double = Double(size) / 2
        var y: Int = 0
        while y < size {
            var x: Int = 0
            while x < size {
                let dx: Double = Double(x) + 0.5 - c
                let dy: Double = Double(y) + 0.5 - c
                let d: Double = (dx * dx + dy * dy).squareRoot() / c
                if d < 1 {
                    // Quattro gradini netti invece di una sfumatura.
                    let a: Double = ((1 - d) * (1 - d) * 4).rounded() / 4
                    image.set(x, y, RGBA(r: 255, g: 200, b: 120, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        glow = Image(image, anchorX: size / 2, anchorY: size / 2)
        return glow
    }

    /// Disegna il fondale fino agli oggetti di scena compresi; i personaggi li aggiunge chi chiama.
    func drawBack(_ g: Canvas, view: View2D, time: Double) {
        let style: BackdropPainter.SkyStyle = PortPaint.skyStyle(phase)
        let sea: (top: RGBA, bottom: RGBA) = PortPaint.seaColors(phase)
        let horizon: Int = view.sy(0)
        g.fill(x: 0, y: 0, w: g.width, h: max(0, horizon), style.top)
        g.gradient(Rect(0, max(0, horizon), g.width, max(0, g.height - horizon)), top: sea.top, bottom: sea.bottom, band: 3)
        // Riflessi sull'acqua: trattini chiari che scorrono piano.
        var row: Int = 0
        while row < 9 {
            let y: Int = horizon + 4 + row * 5
            let shift: Int = Int(time * (6 + Double(row % 3) * 3)) + row * 37
            var x: Int = -((shift % 46) + 46) % 46
            while x < g.width {
                g.fill(x: x + (row * 13) % 23, y: y, w: 6 + (row * 7) % 9, h: 1, RGBA(r: 255, g: 255, b: 255, a: 38))
                x += 46
            }
            row += 1
        }
        let wanted: Int = max(640, g.width + 96)
        if sky.isEmpty || skyWidth != wanted {
            skyWidth = wanted
            sky = Image(BackdropPainter.sky(width: wanted, height: 150, seed: 4, style: style), anchorX: wanted / 2, anchorY: 150)
        }
        g.sprite(sky, x: view.sx(40), y: horizon)

        let sprites: Sprites = Sprites.shared
        let bob: Double = sin(time * Double.pi) > 0 ? 1 : 0
        g.sprite(sprites.get("gozzo"), x: view.sx(-150), y: view.sy(-30 + bob))
        let quay: Image = sprites.get("port_quay")
        var x: Double = -360
        let reach: Double = Double(g.width) / 2 + 40 + abs(view.centerX)
        while x < -reach { x += 32 }
        while x < max(360, reach) {
            for y in [-44.0, -72.0, -100.0, -128.0] {
                g.sprite(quay, x: view.sx(x), y: view.sy(y))
            }
            x += 32
        }
        g.sprite(sprites.get("port_facade"), x: view.sx(70), y: view.sy(-46))
        let props: [(String, Double)] = [("port_bollard", -92.0), ("port_crate", -40.0), ("port_bollard", 180.0), ("port_crate", 206.0)]
        for prop in props {
            g.sprite(sprites.get(prop.0), x: view.sx(prop.1), y: view.sy(-47))
        }
    }

    /// Finestre accese e velo dell'ora: da chiamare dopo aver disegnato i personaggi.
    func drawFront(_ g: Canvas, view: View2D) {
        if phase == DayPhase.evening || phase == DayPhase.night {
            let glow: Image = PortPaint.glowImage()
            for gx in [28.0, 114.0, 50.0, 100.0] {
                g.sprite(glow, x: view.sx(gx), y: view.sy(-6), ink: Ink.add(115))
            }
        }
        let veil: RGBA = PortPaint.tint(phase)
        if veil.a > 0 { g.fill(x: 0, y: 0, w: g.width, h: g.height, veil) }
    }
}
