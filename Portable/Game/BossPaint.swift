/// Tutto ciò che si vede di uno scontro: il corpo del boss (pochi pezzi mossi e ruotati),
/// i pericoli che mette in acqua e le linee d'avviso prima degli attacchi.
/// La logica sta in `BossAI`; qui si ridisegna a ogni fotogramma lo stato che arriva dalla simulazione,
/// tenendo solo il lampo del colpo. Coordinate della simulazione: y verso il basso, come la tela.
final class BossPaint {
    private let kind: BossKind
    private let radius: Double
    private let sprites: Sprites = Sprites.shared
    private var hitFlash: Double = 0
    /// Aloni additivi già pronti, per larghezza, altezza e colore.
    private var glows: [String: Image] = [:]
    /// Traslazione dal mondo alla tela del fotogramma in corso.
    private var ox: Double = 0
    private var oy: Double = 0
    /// Trasparenza del corpo e dei pericoli sotto il buio (svanisce mentre muore).
    private var fade: Double = 1

    private static let warningRed: RGBA = RGBA(hex: 0xFF5A4A)
    private static let jetOrange: RGBA = RGBA(hex: 0xFFB060)

    init(boss: BossBody, arena: Arena) {
        kind = boss.info.kind
        radius = boss.info.radius
    }

    func update(boss: BossBody, hazards: [Hazard], dt: Double) {
        if hitFlash > 0 { hitFlash -= dt }
    }

    func flashHit() {
        hitFlash = 0.12
    }

    // MARK: - Aiuti

    private func place(camX: Double, camY: Double, width: Int, height: Int) {
        ox = Double(width) / 2 - camX.rounded()
        oy = Double(height) / 2 - camY.rounded()
    }

    private func sx(_ x: Double) -> Double { return (x + ox).rounded() }
    private func sy(_ y: Double) -> Double { return (y + oy).rounded() }

    private func frame(_ prefix: String, _ index: Int) -> Image {
        let count: Int = max(1, sprites.frameCount(prefix))
        return sprites.get("\(prefix)_\(((index % count) + count) % count)")
    }

    private func alphaInk(_ alpha: Double) -> Ink {
        if alpha >= 0.999 { return Ink.normal }
        return Ink.alpha(Int((MathUtil.clamp(alpha, 0, 1) * 255).rounded()))
    }

    /// Posa uno sprite (punto d'appoggio in x, y della tela); ruotato o scalato solo se serve.
    private func put(_ g: Canvas, _ image: Image, _ x: Double, _ y: Double, rotation: Double = 0, scaleX: Double = 1,
                     scaleY: Double = 1, ink: Ink = Ink.normal) {
        if abs(rotation) < 1e-4 && abs(scaleX) == 1 && scaleY == 1 {
            g.sprite(image, x: Int(x.rounded()), y: Int(y.rounded()), flipX: scaleX < 0, ink: ink)
        } else {
            g.sprite(image, x: x.rounded(), y: y.rounded(), rotation: rotation, scaleX: scaleX, scaleY: scaleY, ink: ink)
        }
    }

    /// Un pezzo del corpo: segue la dissolvenza e si sbianca per un istante quando viene colpito.
    private func part(_ g: Canvas, _ image: Image, _ x: Double, _ y: Double, rotation: Double = 0, scaleX: Double = 1, alpha: Double = 1) {
        put(g, image, x, y, rotation: rotation, scaleX: scaleX, ink: alphaInk(fade * alpha))
        if hitFlash > 0 {
            let white: RGBA = Theme.white.withAlpha(UInt8(MathUtil.clamp(0.85 * fade * alpha, 0, 1) * 255))
            put(g, image, x, y, rotation: rotation, scaleX: scaleX, ink: Ink.solid(white))
        }
    }

    /// Rotazione e verso di uno sprite che guarda a destra, orientato lungo una direzione senza capovolgerlo.
    private func orient(_ direction: Vec2) -> (rotation: Double, scaleX: Double) {
        if direction.x >= 0 { return (atan2(direction.y, direction.x), 1) }
        return (atan2(-direction.y, -direction.x), -1)
    }

    /// Alone morbido (da posare con `Ink.add`), ellittico, nel colore dato.
    private func glow(width: Int, height: Int, color: RGBA) -> Image {
        let key: String = "\(width)x\(height)-\(color.r)-\(color.g)-\(color.b)"
        if let cached: Image = glows[key] { return cached }
        var buffer: PixelBuffer = PixelBuffer(width: width, height: height)
        let cx: Double = Double(width) / 2
        let cy: Double = Double(height) / 2
        var y: Int = 0
        while y < height {
            var x: Int = 0
            while x < width {
                let dx: Double = (Double(x) + 0.5 - cx) / cx
                let dy: Double = (Double(y) + 0.5 - cy) / cy
                let d: Double = (dx * dx + dy * dy).squareRoot()
                if d < 1 {
                    let a: Double = ((1 - d) * (1 - d) * 6).rounded() / 6
                    buffer.set(x, y, color.withAlpha(UInt8(MathUtil.clamp(a, 0, 1) * 255)))
                }
                x += 1
            }
            y += 1
        }
        let made: Image = Image(buffer, anchorX: width / 2, anchorY: height / 2)
        glows[key] = made
        return made
    }

    /// Striscia piena ruotata: parte da (x0, y0) della tela, lunga `length`, larga `thickness`, angolo in senso orario.
    private func band(_ g: Canvas, x0: Double, y0: Double, angle: Double, length: Double, thickness: Double, _ color: RGBA) {
        if length <= 0 || color.a == 0 { return }
        let ux: Double = cos(angle)
        let uy: Double = sin(angle)
        let nx: Double = -uy
        let ny: Double = ux
        let half: Double = thickness / 2
        let xs: [Double] = [x0 + nx * half, x0 - nx * half, x0 + ux * length + nx * half, x0 + ux * length - nx * half]
        let ys: [Double] = [y0 + ny * half, y0 - ny * half, y0 + uy * length + ny * half, y0 + uy * length - ny * half]
        let top: Int = max(Int((ys.min() ?? y0).rounded(.down)), -g.oy)
        let bottom: Int = min(Int((ys.max() ?? y0).rounded(.up)), g.height - g.oy)
        let left: Double = (xs.min() ?? x0).rounded(.down)
        let right: Double = (xs.max() ?? x0).rounded(.up)
        var row: Int = top
        while row < bottom {
            let cy: Double = Double(row) + 0.5 - y0
            var lo: Double = left
            var hi: Double = right
            // Lungo la striscia: 0 ≤ ux·dx + uy·dy ≤ length; di traverso: |nx·dx + ny·dy| ≤ half.
            BossPaint.limit(&lo, &hi, k: ux, m: uy * cy, low: 0, high: length, x0: x0)
            BossPaint.limit(&lo, &hi, k: nx, m: ny * cy, low: -half, high: half, x0: x0)
            if hi >= lo {
                let a: Int = Int((lo - 0.5).rounded(.up))
                let b: Int = Int((hi - 0.5).rounded(.down))
                if b >= a { g.fill(x: a, y: row, w: b - a + 1, h: 1, color) }
            }
            row += 1
        }
    }

    /// Restringe [lo, hi] ai centri x (pixel + 0,5) per cui low ≤ k·(x − x0) + m ≤ high.
    private static func limit(_ lo: inout Double, _ hi: inout Double, k: Double, m: Double, low: Double, high: Double, x0: Double) {
        if abs(k) < 1e-9 {
            if m < low || m > high {
                lo = 1
                hi = 0
            }
            return
        }
        let a: Double = (low - m) / k + x0
        let b: Double = (high - m) / k + x0
        lo = max(lo, min(a, b))
        hi = min(hi, max(a, b))
    }

    private func fadeOf(_ boss: BossBody) -> Double {
        if boss.move == BossMove.dead { return 0 }
        if boss.move == BossMove.dying { return max(0, 1 - boss.moveTime / BossAI.dyingTime) }
        return 1
    }

    private func isDying(_ boss: BossBody) -> Bool {
        return boss.move == BossMove.dying || boss.move == BossMove.dead
    }

    // MARK: - Sotto il buio

    /// Corpo del boss e pericoli: sotto il velo del buio.
    func draw(_ g: Canvas, boss: BossBody?, hazards: [Hazard], arena: Arena?, camX: Double, camY: Double, time: Double) {
        place(camX: camX, camY: camY, width: g.width, height: g.height)
        fade = 1
        if let b: BossBody = boss {
            fade = fadeOf(b)
            if fade > 0.004 {
                switch kind {
                case .murena:
                    if let a: Arena = arena { drawMurena(g, b, arena: a, time: time) }
                case .granseola: drawGranseola(g, b, time: time)
                case .spada: drawSpada(g, b, time: time)
                case .polpo: drawPolpo(g, b, time: time)
                case .lanterna: drawLanterna(g, b, time: time)
                case .talpa: drawTalpa(g, b, time: time)
                }
            }
        }
        if fade > 0.004 { drawHazards(g, hazards, glowLayer: false, arena: arena, time: time) }
    }

    private func drawMurena(_ g: Canvas, _ boss: BossBody, arena: Arena, time: Double) {
        // Le tane, dietro a tutto: quella da cui sta per uscire si apre.
        var i: Int = 0
        while i < arena.holes.count {
            let hole: ArenaHole = arena.holes[i]
            let active: Bool = i == boss.hole && (boss.move == BossMove.telegraph || (boss.move == BossMove.hidden && boss.chain > 0))
            let at: Vec2 = hole.position - hole.normal * 6
            put(g, sprites.get(active ? "den_1" : "den_0"), sx(at.x), sy(at.y), ink: alphaInk(fade))
            i += 1
        }
        guard boss.hole < arena.holes.count else { return }
        let hole: ArenaHole = arena.holes[boss.hole]
        let out: Bool = boss.extend > 5
        if !out { return }
        // Il corpo: segmenti dalla tana alla testa, con un filo d'onda quando resta fuori.
        let spacing: Double = 9
        let count: Int = max(0, Int((boss.extend - 10) / spacing))
        let side: Vec2 = Vec2(-boss.aim.y, boss.aim.x)
        let sway: Double = boss.move == BossMove.recover ? 2.2 : 0.6
        i = 0
        while i < count {
            let along: Double = Double(i) * spacing + 2
            let wave: Double = sin(time * 7 + Double(i) * 0.7) * sway * min(1, along / 40)
            let q: Vec2 = hole.position + boss.aim * along + side * wave
            part(g, sprites.get("murena_boss_body_\(i % 2)"), sx(q.x), sy(q.y))
            i += 1
        }
        let open: Bool = boss.move == BossMove.attack || boss.move == BossMove.recover
        let pose: (rotation: Double, scaleX: Double) = orient(boss.aim)
        part(g, frame("murena_boss_head", open ? 1 : 0), sx(boss.position.x), sy(boss.position.y), rotation: pose.rotation, scaleX: pose.scaleX)
    }

    private func drawGranseola(_ g: Canvas, _ boss: BossBody, time: Double) {
        var name: String = "walk"
        var rate: Double = abs(boss.velocity.x) > 4 ? 7 : 2
        var shake: Double = 0
        switch boss.move {
        case .telegraph:
            if boss.attack == "slam" {
                name = "rear"
                rate = 5
            } else {
                name = boss.attack == "charge" ? "charge" : "walk"
                shake = 1.2
            }
        case .attack:
            name = "charge"
            rate = 14
        case .recover:
            name = boss.attack == "slam" ? "rear" : "walk"
        case .stunned:
            name = "flip"
            rate = 6
        default:
            break
        }
        part(g, frame("granseola_\(name)", Int(time * rate)), sx(boss.position.x) + (sin(time * 60) * shake).rounded(), sy(boss.position.y))
    }

    private func drawSpada(_ g: Canvas, _ boss: BossBody, time: Double) {
        let rate: Double = boss.move == BossMove.attack ? 18 : (boss.move == BossMove.stunned ? 0 : 7)
        var direction: Vec2 = Vec2(boss.facingRight ? 1 : -1, 0)
        if boss.move == BossMove.telegraph || boss.move == BossMove.attack || boss.move == BossMove.stunned {
            direction = boss.aim
        } else if boss.velocity.length > 12 {
            direction = Vec2(boss.velocity.x, boss.velocity.y * 0.35).normalized()
        }
        var pose: (rotation: Double, scaleX: Double) = orient(direction)
        var jx: Double = 0
        var jy: Double = 0
        if boss.move == BossMove.telegraph {
            jx = sin(time * 70) * 0.8
            jy = -cos(time * 55) * 0.8
        }
        if boss.move == BossMove.stunned { pose.rotation -= sin(time * 26) * 0.05 }
        part(g, frame("spadaccino_swim", Int(time * rate)), sx(boss.position.x) + jx, sy(boss.position.y) + jy,
             rotation: pose.rotation, scaleX: pose.scaleX)
    }

    private func drawPolpo(_ g: Canvas, _ boss: BossBody, time: Double) {
        let px: Double = sx(boss.position.x)
        let py: Double = sy(boss.position.y)
        // Tentacoli: catene che ondeggiano sotto il mantello; più agitati quando attacca.
        let energy: Double = boss.move == BossMove.idle ? 1.0 : 1.9
        var k: Int = 0
        while k < 6 {
            let spread: Double = (Double(k) - 2.5) * 7
            var i: Int = 0
            while i < 7 {
                let t: Double = Double(i + 1)
                let sway: Double = sin(time * 1.7 * energy + Double(k) * 1.1 + t * 0.55) * t * 1.5
                let x: Double = px + spread + spread * t * 0.16 + sway
                let y: Double = py + 14 + t * 5.2 - cos(time * 1.3 + Double(k)) * t * 0.5
                part(g, sprites.get("polpo_boss_arm_\(i < 3 ? 0 : (i < 5 ? 1 : 2))"), x, y)
                i += 1
            }
            k += 1
        }
        let pose: Int = boss.move == BossMove.stunned ? 2 : (boss.isVulnerable || boss.move == BossMove.telegraph ? 1 : 0)
        part(g, frame("polpo_boss_head", pose), px, py)
        // Le anfore tenute davanti alla testa: finché le alza, i colpi rimbalzano.
        let guarded: Bool = !boss.isVulnerable && boss.isAlive
        let shield: Image = sprites.get("polpo_boss_shield_0")
        var s: Int = 0
        while s < 2 {
            let sideX: Double = s == 0 ? -17 : 17
            let drop: Double = guarded ? 0 : 26
            let y: Double = py + 2 + drop - sin(time * 2 + Double(s)) * 1.2
            let tilt: Double = guarded ? (s == 0 ? -0.12 : 0.12) : (s == 0 ? -0.9 : 0.9)
            part(g, shield, px + sideX, y.rounded(), rotation: tilt, alpha: guarded ? 1 : 0.55)
            s += 1
        }
    }

    private func lanternaLit(_ boss: BossBody) -> Bool {
        return boss.lit > 0 || boss.move == BossMove.stunned
    }

    private func drawLanternaBody(_ g: Canvas, _ boss: BossBody) {
        let open: Bool = boss.move == BossMove.attack || boss.move == BossMove.recover || boss.move == BossMove.stunned
        part(g, frame("lanterna_boss", open ? 1 : 0), sx(boss.position.x), sy(boss.position.y), scaleX: boss.facingRight ? 1 : -1)
    }

    private func drawLanterna(_ g: Canvas, _ boss: BossBody, time: Double) {
        // Illuminata esce dal buio: allora si disegna sopra il velo (in drawGlow).
        if boss.move == BossMove.hidden || lanternaLit(boss) { return }
        drawLanternaBody(g, boss)
    }

    private func drawTalpa(_ g: Canvas, _ boss: BossBody, time: Double) {
        let px: Double = sx(boss.position.x)
        let py: Double = sy(boss.position.y)
        let dir: Double = boss.facingRight ? 1 : -1
        let spinning: Bool = boss.move == BossMove.telegraph || boss.move == BossMove.attack
        let shake: Double = boss.move == BossMove.telegraph && boss.attack == "drill" ? (sin(time * 80) * 0.8).rounded() : 0
        // Trivella ed elica stanno dietro lo scafo.
        part(g, frame("talpa_drill", Int(time * (spinning ? 22 : 5))), px + dir * 31, py + shake, scaleX: dir)
        part(g, frame("talpa_prop", Int(time * 14)), px - dir * 41, py, scaleX: dir)
        part(g, sprites.get("talpa_hull_0"), px, py, scaleX: dir)
    }

    // MARK: - Pericoli

    /// Pericoli; `glowLayer` sceglie quelli che brillano sopra il buio (spore, mine, siluri, onde, getti) o gli altri.
    private func drawHazards(_ g: Canvas, _ hazards: [Hazard], glowLayer: Bool, arena: Arena?, time: Double) {
        let blink: Bool = Int(time * 10) % 2 == 0
        // Sotto il buio l'inchiostro va sopra a tutto il resto: due passate.
        var pass: Int = 0
        while pass < (glowLayer ? 1 : 2) {
            var n: Int = 0
            while n < hazards.count {
                let h: Hazard = hazards[n]
                n += 1
                let isInk: Bool = h.kind == Hazard.Kind.ink
                if !glowLayer && (pass == 1) != isInk { continue }
                let x: Double = sx(h.position.x)
                let y: Double = sy(h.position.y)
                switch h.kind {
                case .beam:
                    guard let end: Vec2 = h.end else { continue }
                    let d: Vec2 = end - h.position
                    let length: Double = d.length
                    if !h.isArmed {
                        // Avviso: una linea rossa dove cadrà il tentacolo.
                        if glowLayer {
                            band(g, x0: x, y0: y, angle: atan2(d.y, d.x), length: length, thickness: h.radius * 2,
                                 BossPaint.warningRed.withAlpha(blink ? 107 : 51))
                        }
                    } else if !glowLayer {
                        let count: Int = max(1, Int(length / 9))
                        let dir: Vec2 = length > 1e-3 ? d / length : Vec2(1, 0)
                        var i: Int = 0
                        while i < count {
                            let ratio: Double = Double(i) / Double(count)
                            let q: Vec2 = h.position + dir * (Double(i) * 9 + 6)
                            put(g, sprites.get("polpo_boss_arm_\(ratio < 0.5 ? 0 : (ratio < 0.8 ? 1 : 2))"), sx(q.x), sy(q.y), ink: alphaInk(fade))
                            i += 1
                        }
                    }
                case .jet:
                    guard glowLayer, let end: Vec2 = h.end else { continue }
                    let height: Double = abs(end.y - h.position.y)
                    if !h.isArmed {
                        band(g, x0: x, y0: y, angle: -Double.pi / 2, length: height, thickness: h.radius * 2,
                             BossPaint.jetOrange.withAlpha(blink ? 87 : 36))
                    } else {
                        // La colonna di bolle sale dal fondo.
                        let count: Int = max(1, Int(height / 16) + 1)
                        let phase: Int = Int(time * 12)
                        var i: Int = 0
                        while i < count {
                            put(g, sprites.get((phase + i) % 2 == 0 ? "hz_jet_0" : "hz_jet_1"), x, y - Double(i) * 16 - 8)
                            i += 1
                        }
                    }
                case .rock:
                    if !h.isArmed {
                        if glowLayer {
                            // Una riga sottile dove cadrà il masso.
                            let floor: Double = arena?.maxY ?? (h.position.y + 200)
                            band(g, x0: x, y0: y, angle: Double.pi / 2, length: floor - h.position.y, thickness: 2,
                                 BossPaint.warningRed.withAlpha(blink ? 77 : 31))
                        } else {
                            // Polvere che cade dal soffitto.
                            put(g, sprites.get("hz_dust_0"), x, y, ink: alphaInk(fade * (blink ? 1 : 0.5)))
                        }
                    } else if !glowLayer {
                        put(g, sprites.get("hz_rock_0"), x, y, rotation: -h.age * 5, ink: alphaInk(fade))
                    }
                case .shard, .amphora:
                    if glowLayer { continue }
                    put(g, sprites.get(h.kind == Hazard.Kind.shard ? "hz_shard_0" : "hz_amphora_0"), x, y, rotation: -h.age * 7, ink: alphaInk(fade))
                case .bubble:
                    if glowLayer { continue }
                    put(g, sprites.get("hz_bubble_0"), x, y, ink: alphaInk(fade))
                case .ink:
                    if glowLayer { continue }
                    let alpha: Double = min(1, h.age * 2.5) * min(1, h.life) * fade
                    let scale: Double = 0.8 + min(h.age, 1.0) * 0.25
                    put(g, sprites.get(Int(time * 2) % 2 == 0 ? "hz_ink_0" : "hz_ink_1"), x, y, scaleX: scale, scaleY: scale, ink: alphaInk(alpha))
                case .spore:
                    if !glowLayer { continue }
                    put(g, sprites.get(blink ? "hz_spore_0" : "hz_spore_1"), x, y)
                case .mine:
                    if !glowLayer { continue }
                    let lit: Bool = h.fused ? Int(time * 16) % 2 == 0 : (h.isArmed && Int(time * 2) % 2 == 0)
                    put(g, sprites.get(lit ? "hz_mine_1" : "hz_mine_0"), x, y, ink: alphaInk(h.isArmed ? 1 : 0.6))
                case .torpedo, .wave:
                    if !glowLayer { continue }
                    let rotation: Double = h.velocity.lengthSquared > 1 ? atan2(h.velocity.y, h.velocity.x) : 0
                    put(g, sprites.get(h.kind == Hazard.Kind.torpedo ? "hz_torpedo_0" : "hz_wave_0"), x, y, rotation: rotation)
                }
            }
            pass += 1
        }
    }

    // MARK: - Sopra il buio

    /// Avvisi, esca, luci: sopra il velo del buio, si vedono sempre.
    func drawGlow(_ g: Canvas, boss: BossBody?, hazards: [Hazard], arena: Arena?, camX: Double, camY: Double, time: Double) {
        place(camX: camX, camY: camY, width: g.width, height: g.height)
        guard let b: BossBody = boss else {
            fade = 1
            drawHazards(g, hazards, glowLayer: true, arena: arena, time: time)
            return
        }
        fade = fadeOf(b)
        let dying: Bool = isDying(b)
        let px: Double = sx(b.position.x)
        let py: Double = sy(b.position.y)
        let warning: Bool = b.move == BossMove.telegraph
        let blink: Bool = Int(time * 12) % 2 == 0

        // La lanterna illuminata e il suo bagliore.
        if kind == BossKind.lanterna && b.move != BossMove.hidden && lanternaLit(b) && fade > 0.004 {
            put(g, glow(width: 150, height: 130, color: RGBA(hex: 0xFFF2A0)), px, py, ink: Ink.add(Int(0.5 * fade * 255)))
            drawLanternaBody(g, b)
        }

        // Linea d'avviso per gli attacchi in linea retta.
        if warning && !dying {
            var origin: Vec2? = nil
            var length: Double = 0
            switch (kind, b.attack) {
            case (.murena, "lunge"):
                if let a: Arena = arena, b.hole < a.holes.count { origin = a.holes[b.hole].position }
                length = 215
            case (.spada, "lunge"), (.lanterna, "bite"):
                origin = b.position
                length = kind == BossKind.spada ? 400 : 190
            case (.talpa, "drill"), (.granseola, "charge"):
                origin = b.position
                length = 560
            default:
                break
            }
            if let o: Vec2 = origin {
                band(g, x0: sx(o.x), y0: sy(o.y), angle: atan2(b.aim.y, b.aim.x), length: length, thickness: 3,
                     BossPaint.warningRed.withAlpha(blink ? 140 : 64))
            }
        }
        drawHazards(g, hazards, glowLayer: true, arena: arena, time: time)

        if !dying {
            switch kind {
            case .lanterna:
                if let at: Vec2 = b.lure {
                    let red: Bool = warning
                    let flicker: Bool = red && Int(time * 14) % 2 == 0
                    // Dopo uno stordimento l'esca resta fioca per un po': non si può colpire di nuovo subito.
                    let dim: Bool = b.stunGuard > 0
                    let lx: Double = sx(at.x)
                    let ly: Double = (sy(at.y) - sin(time * 3) * 1.5).rounded()
                    let haloAlpha: Double = dim ? 0.15 : (flicker ? 0.9 : 0.55)
                    put(g, glow(width: 64, height: 64, color: red ? RGBA(hex: 0xFF6A5A) : RGBA(hex: 0xFFF2A0)), lx, ly, ink: Ink.add(Int(haloAlpha * 255)))
                    put(g, frame("lanterna_lure", red ? 1 : 0), lx, ly, ink: alphaInk(dim ? 0.4 : 1))
                }
            case .talpa:
                // La valvola che brilla è il punto debole: cambia posto a ogni fase.
                let weak: Vec2 = b.weakPoint
                let vx: Double = sx(weak.x)
                let vy: Double = sy(weak.y)
                put(g, glow(width: 40, height: 40, color: RGBA(hex: 0xFFE7A8)), vx, vy, ink: Ink.add(Int((0.45 + sin(time * 6) * 0.15) * 255)))
                put(g, frame("talpa_valve", Int(time * 5)), vx, vy, rotation: -time * 1.5)
            default:
                break
            }
            if warning {
                put(g, sprites.get("alert"), px, py - radius - 12)
            }
        }
    }

    // MARK: - Luci

    /// Luci che bucano il buio (coordinate della tela): esca della Lanterna, valvola e fari della Talpa, esplosioni...
    func lights(boss: BossBody?, hazards: [Hazard], camX: Double, camY: Double, width: Int, height: Int) -> [Canvas.Light] {
        place(camX: camX, camY: camY, width: width, height: height)
        var out: [Canvas.Light] = []
        if let b: BossBody = boss, !isDying(b) {
            switch kind {
            case .lanterna:
                if let at: Vec2 = b.lure {
                    out.append(Canvas.Light(x: at.x + ox, y: at.y + oy, radius: 34, strength: b.stunGuard > 0 ? 0.35 : 0.95))
                }
                if b.move != BossMove.hidden && lanternaLit(b) {
                    out.append(Canvas.Light(x: b.position.x + ox, y: b.position.y + oy, radius: radius * 2.4 + 20, strength: 0.85))
                }
            case .talpa:
                let weak: Vec2 = b.weakPoint
                out.append(Canvas.Light(x: weak.x + ox, y: weak.y + oy, radius: 24, strength: 0.9))
                // I fari davanti alla trivella.
                let dir: Double = b.facingRight ? 1 : -1
                out.append(Canvas.Light(x: b.position.x + dir * 52 + ox, y: b.position.y + oy, radius: 40, strength: 0.6))
            default:
                break
            }
        }
        var n: Int = 0
        while n < hazards.count {
            let h: Hazard = hazards[n]
            n += 1
            let x: Double = h.position.x + ox
            let y: Double = h.position.y + oy
            if x < -60 || y < -60 || x > Double(width) + 60 || y > Double(height) + 60 { continue }
            switch h.kind {
            case .mine:
                if h.fused { out.append(Canvas.Light(x: x, y: y, radius: max(h.blast, 24), strength: 0.8)) }
            case .spore:
                out.append(Canvas.Light(x: x, y: y, radius: 12, strength: 0.6))
            case .torpedo:
                out.append(Canvas.Light(x: x, y: y, radius: 16, strength: 0.55))
            default:
                break
            }
        }
        return out
    }
}

/// Barra della vita del boss, sul livello dell'interfaccia: nome, tre terzi (le fasi) e colore acceso quando è scoperto.
func drawBossBar(_ g: Canvas, info: BossInfo, ratio: Double, vulnerable: Bool, top: Int, centerX: Int, maxWidth: Int) {
    let width: Int = max(60, min(186, maxWidth))
    g.text(info.name.text(), x: centerX, y: top + 1, Theme.lime, align: TextAlign.center, shadow: Theme.ink)
    let bar: Rect = Rect(centerX - width / 2, top + 12, width, 7)
    g.roundRect(bar.inset(dx: -1, dy: -1), radius: 3, Theme.ink.withAlpha(150))
    g.roundRect(bar, radius: 2, Theme.lime.withAlpha(60))
    let fill: Int = Int((Double(bar.w) * MathUtil.clamp(ratio, 0, 1)).rounded())
    if fill > 0 { g.roundRect(Rect(bar.x, bar.y, max(fill, 2), bar.h), radius: 2, vulnerable ? Theme.ochre : Theme.terracotta) }
    // Le tacche delle fasi, a due terzi e a un terzo.
    var i: Int = 1
    while i <= 2 {
        g.fill(x: bar.x + bar.w * i / 3 - 1, y: bar.y - 1, w: 2, h: bar.h + 2, Theme.ink)
        i += 1
    }
}
