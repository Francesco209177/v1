import SpriteKit
import UIKit

/// Tutto ciò che si vede di uno scontro: il corpo del boss (fatto di pochi pezzi mossi e ruotati),
/// i pericoli che mette in acqua e le linee d'avviso prima degli attacchi.
/// La logica sta in `BossAI`; qui si disegna soltanto lo stato che arriva dalla simulazione.
final class BossView {
    /// Corpo e pericoli: sotto il velo del buio, come i pesci.
    let node: SKNode = SKNode()
    /// Avvisi, esca e luci: sopra il velo del buio, si vedono sempre.
    let glowLayer: SKNode = SKNode()

    private let kind: BossKind
    private let radius: Double
    private let forge: SpriteForge = SpriteForge.shared
    private let body: SKSpriteNode = SKSpriteNode()
    private var frames: [String: [SKTexture]] = [:]
    private var segments: [SKSpriteNode] = []
    private var dens: [SKSpriteNode] = []
    private var tentacles: [[SKSpriteNode]] = []
    private var shields: [SKSpriteNode] = []
    private let drill: SKSpriteNode = SKSpriteNode()
    private let prop: SKSpriteNode = SKSpriteNode()
    private let valve: SKSpriteNode = SKSpriteNode()
    private let lure: SKSpriteNode = SKSpriteNode()
    private let halo: SKSpriteNode = SKSpriteNode(texture: FishAgent.glowTexture)
    private let bodyGlow: SKSpriteNode = SKSpriteNode(texture: FishAgent.glowTexture)
    private let aimLine: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xFF5A4A), size: CGSize(width: 1, height: 3))
    private let alert: SKSpriteNode = SpriteForge.shared.node("alert")
    private var hazardNodes: [Int: [SKSpriteNode]] = [:]
    private var hazardMarks: [Int: SKSpriteNode] = [:]
    private var hitFlash: Double = 0
    private var hazardTextures: [String: SKTexture] = [:]

    init(boss: BossBody, arena: Arena) {
        kind = boss.info.kind
        radius = boss.info.radius
        node.zPosition = 14
        glowLayer.zPosition = 430
        body.zPosition = 2
        node.addChild(body)

        aimLine.anchorPoint = CGPoint(x: 0, y: 0.5)
        aimLine.isHidden = true
        aimLine.zPosition = 0
        glowLayer.addChild(aimLine)
        alert.isHidden = true
        alert.zPosition = 3
        glowLayer.addChild(alert)

        switch kind {
        case .murena:
            frames["head"] = forge.frames("murena_boss_head")
            setTexture(body, "murena_boss_head_0")
            for hole in arena.holes {
                let den: SKSpriteNode = forge.node("den_0")
                den.position = CGPoint(x: hole.position.x - hole.normal.x * 6, y: -(hole.position.y - hole.normal.y * 6))
                den.zPosition = -8
                node.addChild(den)
                dens.append(den)
            }
        case .granseola:
            for name in ["walk", "charge", "rear", "flip"] { frames[name] = forge.frames("granseola_\(name)") }
            setTexture(body, "granseola_walk_0")
        case .spada:
            frames["swim"] = forge.frames("spadaccino_swim")
            frames["hurt"] = forge.frames("spadaccino_hurt")
            setTexture(body, "spadaccino_swim_0")
        case .polpo:
            frames["head"] = forge.frames("polpo_boss_head")
            setTexture(body, "polpo_boss_head_0")
            body.zPosition = 4
            var k: Int = 0
            while k < 6 {
                var chain: [SKSpriteNode] = []
                var i: Int = 0
                while i < 7 {
                    let piece: SKSpriteNode = forge.node("polpo_boss_arm_\(i < 3 ? 0 : (i < 5 ? 1 : 2))")
                    piece.zPosition = 1
                    node.addChild(piece)
                    chain.append(piece)
                    i += 1
                }
                tentacles.append(chain)
                k += 1
            }
            for _ in 0..<2 {
                let shield: SKSpriteNode = forge.node("polpo_boss_shield_0")
                shield.zPosition = 5
                node.addChild(shield)
                shields.append(shield)
            }
        case .lanterna:
            frames["body"] = forge.frames("lanterna_boss")
            frames["lure"] = forge.frames("lanterna_lure")
            setTexture(body, "lanterna_boss_0")
            setTexture(lure, "lanterna_lure_0")
            lure.zPosition = 2
            glowLayer.addChild(lure)
            halo.size = CGSize(width: 64, height: 64)
            halo.blendMode = SKBlendMode.add
            halo.zPosition = 1
            glowLayer.addChild(halo)
            bodyGlow.size = CGSize(width: 150, height: 130)
            bodyGlow.blendMode = SKBlendMode.add
            bodyGlow.alpha = 0
            bodyGlow.zPosition = 0
            glowLayer.addChild(bodyGlow)
        case .talpa:
            frames["drill"] = forge.frames("talpa_drill")
            frames["prop"] = forge.frames("talpa_prop")
            frames["valve"] = forge.frames("talpa_valve")
            setTexture(body, "talpa_hull_0")
            setTexture(drill, "talpa_drill_0")
            drill.zPosition = 1
            node.addChild(drill)
            setTexture(prop, "talpa_prop_0")
            prop.zPosition = 1
            node.addChild(prop)
            setTexture(valve, "talpa_valve_0")
            valve.zPosition = 2
            glowLayer.addChild(valve)
            halo.size = CGSize(width: 40, height: 40)
            halo.blendMode = SKBlendMode.add
            halo.zPosition = 1
            glowLayer.addChild(halo)
        }
    }

    private func setTexture(_ sprite: SKSpriteNode, _ name: String) {
        sprite.texture = forge.texture(name)
        sprite.size = forge.pixelSize(name)
        sprite.anchorPoint = forge.anchor(name)
    }

    private func texture(_ name: String) -> SKTexture {
        if let cached: SKTexture = hazardTextures[name] { return cached }
        let made: SKTexture = forge.texture(name)
        hazardTextures[name] = made
        return made
    }

    private func frame(_ name: String, _ index: Int) -> SKTexture? {
        guard let list: [SKTexture] = frames[name], !list.isEmpty else { return nil }
        return list[((index % list.count) + list.count) % list.count]
    }

    /// Orienta uno sprite che guarda a destra lungo una direzione di mappa, senza capovolgerlo.
    private func orient(_ sprite: SKNode, along direction: Vec2) {
        if direction.x >= 0 {
            sprite.xScale = 1
            sprite.zRotation = CGFloat(atan2(-direction.y, direction.x))
        } else {
            sprite.xScale = -1
            sprite.zRotation = CGFloat(atan2(direction.y, -direction.x))
        }
    }

    func flashHit() {
        hitFlash = 0.12
    }

    // MARK: - Aggiornamento

    func update(boss: BossBody, hazards: [Hazard], arena: Arena, layout: PixelLayout, elapsed: Double, dt: Double) {
        if hitFlash > 0 { hitFlash -= dt }
        let p: CGPoint = CGPoint(x: layout.snap(boss.position.x), y: layout.snap(-boss.position.y))
        let dying: Bool = boss.move == BossMove.dying || boss.move == BossMove.dead
        let fadeOut: CGFloat = boss.move == BossMove.dead ? 0 : (boss.move == BossMove.dying ? CGFloat(max(0, 1 - boss.moveTime / BossAI.dyingTime)) : 1)
        node.alpha = fadeOut
        body.color = SKColor.white
        body.colorBlendFactor = hitFlash > 0 ? 0.85 : 0
        let warning: Bool = boss.move == BossMove.telegraph
        let blink: Bool = Int(elapsed * 12) % 2 == 0

        // Linea d'avviso per gli attacchi in linea retta.
        var lineOrigin: Vec2? = nil
        var lineLength: Double = 0
        if warning {
            switch (kind, boss.attack) {
            case (.murena, "lunge"):
                if boss.hole < arena.holes.count { lineOrigin = arena.holes[boss.hole].position }
                lineLength = 215
            case (.spada, "lunge"), (.lanterna, "bite"):
                lineOrigin = boss.position
                lineLength = kind == BossKind.spada ? 400 : 190
            case (.talpa, "drill"), (.granseola, "charge"):
                lineOrigin = boss.position
                lineLength = 560
            default:
                break
            }
        }
        if let origin: Vec2 = lineOrigin {
            aimLine.isHidden = false
            aimLine.position = CGPoint(x: origin.x, y: -origin.y)
            aimLine.size = CGSize(width: lineLength, height: 3)
            aimLine.zRotation = CGFloat(atan2(-boss.aim.y, boss.aim.x))
            aimLine.alpha = blink ? 0.55 : 0.25
        } else {
            aimLine.isHidden = true
        }
        alert.isHidden = !warning || dying
        alert.position = CGPoint(x: p.x, y: p.y + CGFloat(radius) + 12)

        switch kind {
        case .murena: updateMurena(boss, arena: arena, at: p, elapsed: elapsed)
        case .granseola: updateGranseola(boss, at: p, elapsed: elapsed)
        case .spada: updateSpada(boss, at: p, elapsed: elapsed)
        case .polpo: updatePolpo(boss, at: p, elapsed: elapsed)
        case .lanterna: updateLanterna(boss, at: p, elapsed: elapsed)
        case .talpa: updateTalpa(boss, at: p, elapsed: elapsed)
        }
        if dying {
            aimLine.isHidden = true
            lure.isHidden = true
            halo.isHidden = true
            valve.isHidden = true
        }
        updateHazards(hazards, arena: arena, elapsed: elapsed)
    }

    private func updateMurena(_ boss: BossBody, arena: Arena, at p: CGPoint, elapsed: Double) {
        guard boss.hole < arena.holes.count else { return }
        let hole: ArenaHole = arena.holes[boss.hole]
        var i: Int = 0
        while i < dens.count {
            let active: Bool = i == boss.hole && (boss.move == BossMove.telegraph || (boss.move == BossMove.hidden && boss.chain > 0))
            let name: String = active ? "den_1" : "den_0"
            let wanted: SKTexture = texture(name)
            if dens[i].texture !== wanted { dens[i].texture = wanted }
            i += 1
        }
        let out: Bool = boss.extend > 5
        body.isHidden = !out
        let open: Bool = boss.move == BossMove.attack || boss.move == BossMove.recover
        if let head: SKTexture = frame("head", open ? 1 : 0), body.texture !== head { body.texture = head }
        body.position = p
        orient(body, along: boss.aim)
        // Il corpo: segmenti dalla tana alla testa, con un filo d'onda quando resta fuori.
        let spacing: Double = 9
        let count: Int = out ? max(0, Int((boss.extend - 10) / spacing)) : 0
        while segments.count < count {
            let piece: SKSpriteNode = forge.node("murena_boss_body_\(segments.count % 2)")
            piece.zPosition = 1
            node.addChild(piece)
            segments.append(piece)
        }
        let side: Vec2 = Vec2(-boss.aim.y, boss.aim.x)
        let sway: Double = boss.move == BossMove.recover ? 2.2 : 0.6
        i = 0
        while i < segments.count {
            if i < count {
                let along: Double = Double(i) * spacing + 2
                let wave: Double = sin(elapsed * 7 + Double(i) * 0.7) * sway * min(1, along / 40)
                let q: Vec2 = hole.position + boss.aim * along + side * wave
                segments[i].isHidden = false
                segments[i].position = CGPoint(x: q.x, y: -q.y)
            } else {
                segments[i].isHidden = true
            }
            i += 1
        }
    }

    private func updateGranseola(_ boss: BossBody, at p: CGPoint, elapsed: Double) {
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
        if let wanted: SKTexture = frame(name, Int(elapsed * rate)), body.texture !== wanted { body.texture = wanted }
        body.position = CGPoint(x: p.x + CGFloat(sin(elapsed * 60) * shake), y: p.y)
        body.xScale = 1
        body.zRotation = 0
    }

    private func updateSpada(_ boss: BossBody, at p: CGPoint, elapsed: Double) {
        let rate: Double = boss.move == BossMove.attack ? 18 : (boss.move == BossMove.stunned ? 0 : 7)
        if let wanted: SKTexture = frame("swim", Int(elapsed * rate)), body.texture !== wanted { body.texture = wanted }
        var direction: Vec2 = Vec2(boss.facingRight ? 1 : -1, 0)
        if boss.move == BossMove.telegraph || boss.move == BossMove.attack || boss.move == BossMove.stunned {
            direction = boss.aim
        } else if boss.velocity.length > 12 {
            direction = Vec2(boss.velocity.x, boss.velocity.y * 0.35).normalized()
        }
        orient(body, along: direction)
        var jitter: CGPoint = CGPoint.zero
        if boss.move == BossMove.telegraph { jitter = CGPoint(x: sin(elapsed * 70) * 0.8, y: cos(elapsed * 55) * 0.8) }
        if boss.move == BossMove.stunned { body.zRotation += CGFloat(sin(elapsed * 26) * 0.05) }
        body.position = CGPoint(x: p.x + jitter.x, y: p.y + jitter.y)
    }

    private func updatePolpo(_ boss: BossBody, at p: CGPoint, elapsed: Double) {
        let pose: Int = boss.move == BossMove.stunned ? 2 : (boss.isVulnerable || boss.move == BossMove.telegraph ? 1 : 0)
        if let wanted: SKTexture = frame("head", pose), body.texture !== wanted { body.texture = wanted }
        body.position = p
        // Tentacoli: catene che ondeggiano sotto il mantello; più agitati quando attacca.
        let energy: Double = boss.move == BossMove.idle ? 1.0 : 1.9
        var k: Int = 0
        while k < tentacles.count {
            let spread: Double = (Double(k) - 2.5) * 7
            var i: Int = 0
            while i < tentacles[k].count {
                let t: Double = Double(i + 1)
                let sway: Double = sin(elapsed * 1.7 * energy + Double(k) * 1.1 + t * 0.55) * t * 1.5
                let x: Double = Double(p.x) + spread + spread * t * 0.16 + sway
                let y: Double = Double(p.y) - 14 - t * 5.2 + cos(elapsed * 1.3 + Double(k)) * t * 0.5
                tentacles[k][i].position = CGPoint(x: x, y: y)
                i += 1
            }
            k += 1
        }
        // Le anfore tenute davanti alla testa: finché le alza, i colpi rimbalzano.
        let guarded: Bool = !boss.isVulnerable && boss.isAlive
        var s: Int = 0
        while s < shields.count {
            let sideX: CGFloat = s == 0 ? -17 : 17
            let lift: CGFloat = guarded ? 0 : -26
            shields[s].position = CGPoint(x: p.x + sideX, y: p.y - 2 + lift + CGFloat(sin(elapsed * 2 + Double(s)) * 1.2))
            shields[s].zRotation = guarded ? (s == 0 ? 0.12 : -0.12) : (s == 0 ? 0.9 : -0.9)
            shields[s].alpha = guarded ? 1 : 0.55
            s += 1
        }
    }

    private func updateLanterna(_ boss: BossBody, at p: CGPoint, elapsed: Double) {
        let hiddenNow: Bool = boss.move == BossMove.hidden
        let open: Bool = boss.move == BossMove.attack || boss.move == BossMove.recover || boss.move == BossMove.stunned
        if let wanted: SKTexture = frame("body", open ? 1 : 0), body.texture !== wanted { body.texture = wanted }
        body.position = p
        body.xScale = boss.facingRight ? 1 : -1
        body.isHidden = hiddenNow
        // Illuminata (dopo il morso, o stordita) esce dal buio: è il momento di colpirla.
        let lit: Bool = boss.lit > 0 || boss.move == BossMove.stunned
        body.zPosition = lit ? 420 : 2
        bodyGlow.position = p
        bodyGlow.alpha = lit ? 0.5 : 0
        if let at: Vec2 = boss.lure {
            let red: Bool = boss.move == BossMove.telegraph
            let flicker: Bool = red && Int(elapsed * 14) % 2 == 0
            lure.isHidden = false
            halo.isHidden = false
            if let wanted: SKTexture = frame("lure", red ? 1 : 0), lure.texture !== wanted { lure.texture = wanted }
            let bob: Double = sin(elapsed * 3) * 1.5
            lure.position = CGPoint(x: at.x, y: -at.y + bob)
            halo.position = lure.position
            // Dopo uno stordimento l'esca resta fioca per un po': non si può colpire di nuovo subito.
            let dim: Bool = boss.stunGuard > 0
            lure.alpha = dim ? 0.4 : 1
            halo.alpha = dim ? 0.15 : (flicker ? 0.9 : 0.55)
            halo.color = red ? SKColor(hex: 0xFF6A5A) : SKColor(hex: 0xFFF2A0)
            halo.colorBlendFactor = 1
        } else {
            lure.isHidden = true
            halo.isHidden = true
        }
    }

    private func updateTalpa(_ boss: BossBody, at p: CGPoint, elapsed: Double) {
        let dir: CGFloat = boss.facingRight ? 1 : -1
        body.position = p
        body.xScale = dir
        let spinning: Bool = boss.move == BossMove.telegraph || boss.move == BossMove.attack
        if let wanted: SKTexture = frame("drill", Int(elapsed * (spinning ? 22 : 5))), drill.texture !== wanted { drill.texture = wanted }
        let shake: CGFloat = boss.move == BossMove.telegraph && boss.attack == "drill" ? CGFloat(sin(elapsed * 80) * 0.8) : 0
        drill.position = CGPoint(x: p.x + dir * 31, y: p.y + shake)
        drill.xScale = dir
        if let wanted: SKTexture = frame("prop", Int(elapsed * 14)), prop.texture !== wanted { prop.texture = wanted }
        prop.position = CGPoint(x: p.x - dir * 41, y: p.y)
        // La valvola che brilla è il punto debole: cambia posto a ogni fase.
        let weak: Vec2 = boss.weakPoint
        valve.isHidden = false
        halo.isHidden = false
        valve.position = CGPoint(x: weak.x, y: -weak.y)
        if let wanted: SKTexture = frame("valve", Int(elapsed * 5)), valve.texture !== wanted { valve.texture = wanted }
        valve.zRotation = CGFloat(elapsed * 1.5)
        halo.position = valve.position
        halo.alpha = 0.45 + CGFloat(sin(elapsed * 6)) * 0.15
    }

    // MARK: - Pericoli

    private func updateHazards(_ hazards: [Hazard], arena: Arena, elapsed: Double) {
        var seen: Set<Int> = []
        for h in hazards {
            seen.insert(h.id)
            let at: CGPoint = CGPoint(x: h.position.x, y: -h.position.y)
            let blink: Bool = Int(elapsed * 10) % 2 == 0
            switch h.kind {
            case .beam:
                guard let end: Vec2 = h.end else { continue }
                let d: Vec2 = end - h.position
                let length: Double = d.length
                if !h.isArmed {
                    // Avviso: una linea rossa dove cadrà il tentacolo.
                    let mark: SKSpriteNode = marker(h.id, width: 5)
                    mark.position = at
                    mark.size = CGSize(width: CGFloat(length), height: CGFloat(h.radius * 2))
                    mark.zRotation = CGFloat(atan2(-d.y, d.x))
                    mark.alpha = blink ? 0.42 : 0.2
                } else {
                    hazardMarks[h.id]?.isHidden = true
                    let count: Int = max(1, Int(length / 9))
                    var pieces: [SKSpriteNode] = hazardNodes[h.id] ?? []
                    while pieces.count < count {
                        let ratio: Double = Double(pieces.count) / Double(count)
                        let piece: SKSpriteNode = forge.node("polpo_boss_arm_\(ratio < 0.5 ? 0 : (ratio < 0.8 ? 1 : 2))")
                        piece.zPosition = 6
                        node.addChild(piece)
                        pieces.append(piece)
                    }
                    hazardNodes[h.id] = pieces
                    let dir: Vec2 = length > 1e-3 ? d / length : Vec2(1, 0)
                    var i: Int = 0
                    while i < pieces.count {
                        let q: Vec2 = h.position + dir * (Double(i) * 9 + 6)
                        pieces[i].position = CGPoint(x: q.x, y: -q.y)
                        i += 1
                    }
                }
            case .jet:
                guard let end: Vec2 = h.end else { continue }
                let height: Double = abs(end.y - h.position.y)
                if !h.isArmed {
                    let mark: SKSpriteNode = marker(h.id, width: 5)
                    mark.color = SKColor(hex: 0xFFB060)
                    mark.position = at
                    mark.size = CGSize(width: CGFloat(height), height: CGFloat(h.radius * 2))
                    mark.zRotation = CGFloat.pi / 2
                    mark.alpha = blink ? 0.34 : 0.14
                } else {
                    hazardMarks[h.id]?.isHidden = true
                    let count: Int = max(1, Int(height / 16) + 1)
                    var pieces: [SKSpriteNode] = hazardNodes[h.id] ?? []
                    while pieces.count < count {
                        let piece: SKSpriteNode = SKSpriteNode(texture: texture("hz_jet_0"), size: forge.pixelSize("hz_jet_0"))
                        piece.zPosition = 7
                        glowLayer.addChild(piece)
                        pieces.append(piece)
                    }
                    hazardNodes[h.id] = pieces
                    let phase: Int = Int(elapsed * 12)
                    var i: Int = 0
                    while i < pieces.count {
                        pieces[i].position = CGPoint(x: h.position.x, y: -h.position.y + Double(i) * 16 + 8)
                        let wanted: SKTexture = texture((phase + i) % 2 == 0 ? "hz_jet_0" : "hz_jet_1")
                        if pieces[i].texture !== wanted { pieces[i].texture = wanted }
                        i += 1
                    }
                }
            default:
                let sprite: SKSpriteNode = single(h)
                sprite.position = at
                switch h.kind {
                case .rock:
                    if !h.isArmed {
                        // Polvere dal soffitto, e una riga sottile dove cadrà il masso.
                        let wanted: SKTexture = texture("hz_dust_0")
                        if sprite.texture !== wanted {
                            sprite.texture = wanted
                            sprite.size = forge.pixelSize("hz_dust_0")
                        }
                        sprite.alpha = blink ? 1 : 0.5
                        sprite.zRotation = 0
                        let mark: SKSpriteNode = marker(h.id, width: 2)
                        mark.position = at
                        mark.size = CGSize(width: arena.maxY - h.position.y, height: 2)
                        mark.zRotation = -CGFloat.pi / 2
                        mark.alpha = blink ? 0.3 : 0.12
                    } else {
                        hazardMarks[h.id]?.isHidden = true
                        let wanted: SKTexture = texture("hz_rock_0")
                        if sprite.texture !== wanted {
                            sprite.texture = wanted
                            sprite.size = forge.pixelSize("hz_rock_0")
                        }
                        sprite.alpha = 1
                        sprite.zRotation = CGFloat(h.age * 5)
                    }
                case .shard, .amphora:
                    sprite.zRotation = CGFloat(h.age * 7)
                case .ink:
                    let wanted: SKTexture = texture(Int(elapsed * 2) % 2 == 0 ? "hz_ink_0" : "hz_ink_1")
                    if sprite.texture !== wanted { sprite.texture = wanted }
                    sprite.alpha = CGFloat(min(1, h.age * 2.5) * min(1, h.life))
                    sprite.setScale(CGFloat(0.8 + min(h.age, 1.0) * 0.25))
                case .spore:
                    let wanted: SKTexture = texture(blink ? "hz_spore_0" : "hz_spore_1")
                    if sprite.texture !== wanted { sprite.texture = wanted }
                case .mine:
                    let lit: Bool = h.fused ? Int(elapsed * 16) % 2 == 0 : (h.isArmed && Int(elapsed * 2) % 2 == 0)
                    let wanted: SKTexture = texture(lit ? "hz_mine_1" : "hz_mine_0")
                    if sprite.texture !== wanted { sprite.texture = wanted }
                    sprite.alpha = h.isArmed ? 1 : 0.6
                case .torpedo, .wave:
                    if h.velocity.lengthSquared > 1 { sprite.zRotation = CGFloat(atan2(-h.velocity.y, h.velocity.x)) }
                default:
                    break
                }
            }
        }
        for (id, pieces) in hazardNodes where !seen.contains(id) {
            for piece in pieces { piece.removeFromParent() }
            hazardNodes[id] = nil
        }
        for (id, mark) in hazardMarks where !seen.contains(id) {
            mark.removeFromParent()
            hazardMarks[id] = nil
        }
    }

    /// Lo sprite di un pericolo fatto di un pezzo solo, creato la prima volta che serve.
    private func single(_ h: Hazard) -> SKSpriteNode {
        if let existing: SKSpriteNode = hazardNodes[h.id]?.first { return existing }
        let name: String
        var above: Bool = false
        switch h.kind {
        case .rock: name = "hz_dust_0"
        case .shard: name = "hz_shard_0"
        case .amphora: name = "hz_amphora_0"
        case .bubble: name = "hz_bubble_0"
        case .ink: name = "hz_ink_0"
        case .spore:
            name = "hz_spore_0"
            above = true
        case .mine:
            name = "hz_mine_0"
            above = true
        case .torpedo:
            name = "hz_torpedo_0"
            above = true
        case .wave:
            name = "hz_wave_0"
            above = true
        case .beam, .jet: name = "hz_bubble_0"
        }
        let sprite: SKSpriteNode = SKSpriteNode(texture: texture(name), size: forge.pixelSize(name))
        sprite.zPosition = h.kind == Hazard.Kind.ink ? 20 : 8
        if above {
            glowLayer.addChild(sprite)
        } else {
            node.addChild(sprite)
        }
        hazardNodes[h.id] = [sprite]
        return sprite
    }

    /// Segno d'avviso (linea rossa) associato a un pericolo non ancora attivo.
    private func marker(_ id: Int, width: CGFloat) -> SKSpriteNode {
        if let existing: SKSpriteNode = hazardMarks[id] {
            existing.isHidden = false
            return existing
        }
        let mark: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xFF5A4A), size: CGSize(width: 10, height: width))
        mark.anchorPoint = CGPoint(x: 0, y: 0.5)
        mark.zPosition = 0
        glowLayer.addChild(mark)
        hazardMarks[id] = mark
        return mark
    }
}

/// Barra della vita del boss, in alto al centro: nome, tre terzi (le fasi) e il consiglio iniziale.
final class BossBar: SKNode {
    private let bar: MeterBar = MeterBar()
    private let nameLabel: SKLabelNode
    private let hintLabel: SKLabelNode = SKLabelNode()
    private var ticks: [SKSpriteNode] = []
    private var width: CGFloat = 260

    init(info: BossInfo) {
        nameLabel = Theme.label(info.name.text(), size: 14, weight: UIFont.Weight.heavy, color: Theme.lime)
        super.init()
        addChild(bar)
        nameLabel.zPosition = 2
        addChild(nameLabel)
        for _ in 0..<2 {
            let tick: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 2, height: 10))
            tick.zPosition = 3
            addChild(tick)
            ticks.append(tick)
        }
        hintLabel.numberOfLines = 0
        hintLabel.lineBreakMode = NSLineBreakMode.byWordWrapping
        hintLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
        hintLabel.verticalAlignmentMode = SKLabelVerticalAlignmentMode.top
        hintLabel.attributedText = Theme.attributed(info.hint.text(), size: 13, weight: UIFont.Weight.semibold, color: Theme.ochre)
        hintLabel.zPosition = 2
        addChild(hintLabel)
        // Il consiglio resta qualche secondo, poi lascia libero lo schermo.
        hintLabel.run(SKAction.sequence([SKAction.wait(forDuration: 8), SKAction.fadeOut(withDuration: 0.8)]))
        bar.set(value: 1, color: Theme.terracotta)
    }

    required init?(coder aDecoder: NSCoder) {
        nameLabel = SKLabelNode()
        super.init(coder: aDecoder)
    }

    /// `top` è il bordo alto dell'area sicura; la barra sta centrata sotto di esso.
    func layout(top: CGFloat, maxWidth: CGFloat) {
        width = min(300, maxWidth)
        bar.resize(CGSize(width: width, height: 12))
        bar.position = CGPoint(x: -width / 2, y: top - 28)
        nameLabel.position = CGPoint(x: 0, y: top - 11)
        var i: Int = 0
        while i < ticks.count {
            ticks[i].position = CGPoint(x: -width / 2 + width * CGFloat(i + 1) / 3, y: top - 28)
            i += 1
        }
        hintLabel.preferredMaxLayoutWidth = min(maxWidth, 420)
        hintLabel.position = CGPoint(x: 0, y: top - 42)
    }

    func update(ratio: Double, vulnerable: Bool) {
        // La barra si accende quando il punto debole è scoperto.
        bar.set(value: ratio, color: vulnerable ? Theme.ochre : Theme.terracotta)
    }
}
