import Foundation

/// Scolpisce il Calderone a partire da un seme: stesso seme, stessa mappa.
/// Ogni zona ha una forma propria (conca, cenge, mare aperto, rovine, camini, sala),
/// ma un canale principale garantisce sempre una via libera dalla superficie al fondo.
enum CaveGenerator {

    static func generate(seed: UInt64, world: WorldData) -> CaveMap {
        let cols: Int = world.mapWidthMeters
        let rows: Int = world.maxDepthMeters
        var map: CaveMap = CaveMap(cols: cols, rows: rows, tileSize: world.pixelsPerMeter, seed: seed)
        if cols < 8 || rows < 8 || world.zones.isEmpty { return map }
        var rng: SeededRNG = SeededRNG(seed: seed)

        // 1. Canale principale: serpeggia ma resta lontano dai bordi.
        var channel: [Double] = [Double](repeating: Double(cols) / 2, count: rows)
        let wander: Double = Double(cols) * 0.26
        let phaseA: Double = rng.range(0, 6.28)
        let phaseB: Double = rng.range(0, 6.28)
        var r: Int = 0
        while r < rows {
            let t: Double = Double(r)
            let n: Double = Noise.fbm(t * 0.021, 7.7, seed: seed &+ 11, octaves: 3) - 0.5
            let s: Double = sin(t * 0.045 + phaseA) * 0.45 + sin(t * 0.017 + phaseB) * 0.55
            channel[r] = Double(cols) / 2 + (s * 0.6 + n * 1.2) * wander
            r += 1
        }
        map.channel = channel

        // 2. Pareti laterali e scogli, zona per zona.
        r = 0
        while r < rows {
            let depth: Double = Double(r)
            let zone: ZoneInfo = world.zone(atDepth: depth) ?? world.zones[0]
            let span: Double = Double(max(zone.depthTo - zone.depthFrom, 1))
            let local: Double = (depth - Double(zone.depthFrom)) / span
            let walls: (left: Double, right: Double) = wallThickness(zone: zone, local: local, row: r, seed: seed)
            var c: Int = 0
            while c < cols {
                var isRock: Bool = Double(c) < walls.left || Double(c) >= Double(cols) - walls.right
                if !isRock {
                    isRock = island(zone: zone, c: c, r: r, local: local, seed: seed)
                }
                if isRock { map.setSolid(c, r, true) }
                c += 1
            }
            r += 1
        }

        // 3. Strutture tipiche di alcune zone.
        for zone in world.zones {
            if zone.shape == "ruins" {
                buildRuins(&map, zone: zone, rng: &rng)
            } else if zone.shape == "chimneys" {
                buildChimneys(&map, zone: zone, rng: &rng)
            } else if zone.shape == "hall" {
                buildHall(&map, zone: zone)
            }
        }

        carvePockets(&map, world: world, rng: &rng)

        // 4. Scava il canale principale e apre la superficie.
        r = 0
        while r < rows {
            let depth: Double = Double(r)
            let zone: ZoneInfo = world.zone(atDepth: depth) ?? world.zones[0]
            let base: Double = zone.shape == "open" ? 7.0 : (zone.shape == "hall" ? 6.0 : 4.2)
            let radius: Double = base + (Noise.value(depth * 0.09, 3.3, seed: seed &+ 23) - 0.5) * 2.4
            let cx: Double = channel[r]
            var c: Int = Int(cx - radius - 1)
            while c <= Int(cx + radius + 1) {
                if abs(Double(c) - cx) <= radius { map.setSolid(c, r, false) }
                c += 1
            }
            r += 1
        }
        var c: Int = 0
        while c < cols {
            map.setSolid(c, 0, false)
            if c > 2 && c < cols - 3 { map.setSolid(c, 1, false) }
            c += 1
        }

        // 5. Fondo chiuso.
        r = rows - 3
        while r < rows {
            c = 0
            while c < cols {
                map.setSolid(c, r, true)
                c += 1
            }
            r += 1
        }

        // 6. Pulizia: toglie i granelli isolati e chiude le sacche d'acqua irraggiungibili.
        smooth(&map, passes: 2)
        sealUnreachable(&map, startColumn: Int(channel[2]), startRow: 2)
        map.rebuildField()

        // 7. Flora e punti d'interesse.
        placeProps(&map, world: world, rng: &rng)
        return map
    }

    // MARK: - Forme delle zone

    private static func wallThickness(zone: ZoneInfo, local: Double, row: Int, seed: UInt64) -> (left: Double, right: Double) {
        let depth: Double = Double(row)
        let nl: Double = Noise.fbm(depth * 0.055, 1.3, seed: seed &+ 101, octaves: 4)
        let nr: Double = Noise.fbm(depth * 0.055, 9.1, seed: seed &+ 202, octaves: 4)
        let range: Double = zone.wallMax - zone.wallMin
        var left: Double
        var right: Double
        switch zone.shape {
        case "bowl":
            // Conca: quasi aperta in superficie, si stringe scendendo; terrazze di sabbia sui lati.
            let grow: Double = pow(local, 1.35)
            let terraceL: Double = (grow * 5).rounded(.down) / 5
            let terraceR: Double = ((grow + 0.09) * 4).rounded(.down) / 4
            left = zone.wallMin + range * (terraceL * 0.75 + grow * 0.25) + (nl - 0.5) * 5
            right = zone.wallMin + range * (min(terraceR, 1) * 0.75 + grow * 0.25) + (nr - 0.5) * 5
        case "open":
            left = zone.wallMin + range * nl
            right = zone.wallMin + range * nr * 0.7
        case "hall":
            let arch: Double = sin(local * Double.pi)
            left = zone.wallMax - range * arch
            right = zone.wallMax - range * arch
        default:
            left = zone.wallMin + range * nl
            right = zone.wallMin + range * nr
        }
        // Rientranze brusche: sporgenze e nicchie.
        let notch: Double = Noise.value(depth * 0.31, 5.5, seed: seed &+ 303)
        if notch > 0.72 { left += (notch - 0.72) * 22 }
        let notchR: Double = Noise.value(depth * 0.29, 8.8, seed: seed &+ 404)
        if notchR > 0.72 { right += (notchR - 0.72) * 22 }
        return (left: max(left, 2), right: max(right, 2))
    }

    private static func island(zone: ZoneInfo, c: Int, r: Int, local: Double, seed: UInt64) -> Bool {
        if zone.shape == "hall" { return false }
        if r < 6 { return false }
        let x: Double = Double(c)
        let y: Double = Double(r)
        let n: Double = Noise.fbm(x * 0.085 / zone.stretch, y * 0.085 * max(zone.stretch, 1) * 0.55, seed: seed &+ 505, octaves: 3)
        var threshold: Double = zone.islands
        // Ai confini tra zone gli scogli si infittiscono: sono le "strettoie" di passaggio.
        let edge: Double = min(local, 1 - local)
        if edge < 0.06 { threshold -= (0.06 - edge) * 1.6 }
        return n > threshold
    }

    private static func buildRuins(_ map: inout CaveMap, zone: ZoneInfo, rng: inout SeededRNG) {
        // Piani orizzontali di una città sprofondata: solai con varchi, sorretti da colonne.
        var row: Int = zone.depthFrom + 14
        while row < zone.depthTo - 10 {
            let thickness: Int = rng.int(2, 3)
            let gapCenter: Int = rng.int(18, map.cols - 19)
            let gapHalf: Int = rng.int(4, 7)
            let secondGap: Int = rng.int(14, map.cols - 15)
            var c: Int = 0
            while c < map.cols {
                let inGap: Bool = abs(c - gapCenter) <= gapHalf || abs(c - secondGap) <= 3
                if !inGap {
                    var t: Int = 0
                    while t < thickness {
                        map.setSolid(c, row + t, true)
                        t += 1
                    }
                }
                c += 1
            }
            // Colonne sotto il solaio.
            let columns: Int = rng.int(3, 6)
            var k: Int = 0
            while k < columns {
                let cc: Int = rng.int(10, map.cols - 11)
                let height: Int = rng.int(5, 10)
                if abs(cc - gapCenter) > gapHalf + 1 {
                    var h: Int = 0
                    while h < height {
                        map.setSolid(cc, row + thickness + h, true)
                        map.setSolid(cc + 1, row + thickness + h, true)
                        h += 1
                    }
                }
                k += 1
            }
            row += rng.int(15, 22)
        }
    }

    private static func buildChimneys(_ map: inout CaveMap, zone: ZoneInfo, rng: inout SeededRNG) {
        // Camini idrotermali: guglie sottili che salgono da cenge.
        var row: Int = zone.depthFrom + 20
        while row < zone.depthTo - 12 {
            let count: Int = rng.int(2, 4)
            var k: Int = 0
            while k < count {
                let base: Int = rng.int(12, map.cols - 13)
                let height: Int = rng.int(7, 15)
                let half: Int = rng.int(1, 2)
                var h: Int = 0
                while h < height {
                    let width: Int = h > height - 3 ? max(half - 1, 1) : half
                    var dc: Int = -width
                    while dc <= width {
                        map.setSolid(base + dc, row - h, true)
                        dc += 1
                    }
                    h += 1
                }
                // Cengia alla base.
                var dc: Int = -half - 3
                while dc <= half + 3 {
                    map.setSolid(base + dc, row + 1, true)
                    map.setSolid(base + dc, row + 2, true)
                    dc += 1
                }
                k += 1
            }
            row += rng.int(22, 32)
        }
    }

    private static func buildHall(_ map: inout CaveMap, zone: ZoneInfo) {
        // Sala del santuario: una grande volta libera con il pavimento piatto.
        let floor: Int = zone.depthTo - 6
        var r: Int = zone.depthFrom + 8
        while r < floor {
            var c: Int = 0
            while c < map.cols {
                let margin: Int = Int(zone.wallMin)
                if c >= margin && c < map.cols - margin { map.setSolid(c, r, false) }
                c += 1
            }
            r += 1
        }
        // File di pilastri ai lati.
        var c: Int = Int(zone.wallMin) + 6
        while c < map.cols - Int(zone.wallMin) - 6 {
            let central: Bool = abs(c - map.cols / 2) < 14
            if !central {
                r = zone.depthFrom + 8
                while r < floor {
                    map.setSolid(c, r, true)
                    map.setSolid(c + 1, r, true)
                    r += 1
                }
            }
            c += 9
        }
    }

    /// Grotte laterali: una camera scavata dentro la parete, collegata all'acqua aperta da un cunicolo.
    /// Sono i posti dove più avanti si nascondono casse e creature timide.
    private static func carvePockets(_ map: inout CaveMap, world: WorldData, rng: inout SeededRNG) {
        var row: Int = 18
        while row < map.rows - 30 {
            let zone: ZoneInfo = world.zone(atDepth: Double(row)) ?? world.zones[0]
            if zone.shape != "hall" && zone.shape != "open" {
                let leftSide: Bool = rng.chance(0.5)
                let depthIn: Int = rng.int(5, 9)
                let radiusX: Int = rng.int(3, 5)
                let radiusY: Int = rng.int(2, 3)
                // Trova il bordo interno della parete su questa riga.
                var edge: Int = leftSide ? 0 : map.cols - 1
                var guardCount: Int = 0
                while guardCount < map.cols && map.isSolidCell(edge, row) {
                    edge += leftSide ? 1 : -1
                    guardCount += 1
                }
                let center: Int = leftSide ? edge - depthIn : edge + depthIn
                if center > radiusX + 2 && center < map.cols - radiusX - 3 {
                    var dr: Int = -radiusY
                    while dr <= radiusY {
                        var dc: Int = -radiusX
                        while dc <= radiusX {
                            let nx: Double = Double(dc) / Double(radiusX)
                            let ny: Double = Double(dr) / Double(radiusY)
                            if nx * nx + ny * ny <= 1.0 { map.setSolid(center + dc, row + dr, false) }
                            dc += 1
                        }
                        dr += 1
                    }
                    // Cunicolo verso l'acqua aperta, alto due celle.
                    var c: Int = min(center, edge)
                    while c <= max(center, edge) {
                        map.setSolid(c, row, false)
                        map.setSolid(c, row + 1, false)
                        c += 1
                    }
                }
            }
            row += rng.int(16, 30)
        }
    }

    // MARK: - Pulizia

    private static func smooth(_ map: inout CaveMap, passes: Int) {
        var pass: Int = 0
        while pass < passes {
            let snapshot: CaveMap = map
            var r: Int = 1
            while r < map.rows - 1 {
                var c: Int = 0
                while c < map.cols {
                    var neighbours: Int = 0
                    var dr: Int = -1
                    while dr <= 1 {
                        var dc: Int = -1
                        while dc <= 1 {
                            if !(dr == 0 && dc == 0) && snapshot.isSolidCell(c + dc, r + dr) { neighbours += 1 }
                            dc += 1
                        }
                        dr += 1
                    }
                    let wasSolid: Bool = snapshot.isSolidCell(c, r)
                    if wasSolid && neighbours <= 1 {
                        map.setSolid(c, r, false)
                    } else if !wasSolid && neighbours >= 7 {
                        map.setSolid(c, r, true)
                    }
                    c += 1
                }
                r += 1
            }
            pass += 1
        }
    }

    /// Riempie di roccia ogni cella d'acqua non collegata alla superficie.
    private static func sealUnreachable(_ map: inout CaveMap, startColumn: Int, startRow: Int) {
        var reached: [Bool] = [Bool](repeating: false, count: map.cols * map.rows)
        var stack: [Int] = []
        let sc: Int = MathUtil.clampInt(startColumn, 0, map.cols - 1)
        var c: Int = 0
        while c < map.cols {
            if !map.isSolidCell(c, 0) {
                reached[c] = true
                stack.append(c)
            }
            c += 1
        }
        if !map.isSolidCell(sc, startRow) {
            reached[startRow * map.cols + sc] = true
            stack.append(startRow * map.cols + sc)
        }
        while let index: Int = stack.popLast() {
            let cc: Int = index % map.cols
            let rr: Int = index / map.cols
            let neighbours: [(Int, Int)] = [(cc + 1, rr), (cc - 1, rr), (cc, rr + 1), (cc, rr - 1)]
            for (nc, nr) in neighbours {
                if nc < 0 || nc >= map.cols || nr < 0 || nr >= map.rows { continue }
                let ni: Int = nr * map.cols + nc
                if reached[ni] || map.isSolidCell(nc, nr) { continue }
                reached[ni] = true
                stack.append(ni)
            }
        }
        var i: Int = 0
        while i < reached.count {
            if !reached[i] && map.solid[i] == 0 {
                map.setSolid(i % map.cols, i / map.cols, true)
            }
            i += 1
        }
    }

    // MARK: - Oggetti

    private static func placeProps(_ map: inout CaveMap, world: WorldData, rng: inout SeededRNG) {
        let ts: Double = Double(map.tileSize)
        var props: [MapProp] = []
        var r: Int = 2
        while r < map.rows - 3 {
            let zone: ZoneInfo = world.zone(atDepth: Double(r)) ?? world.zones[0]
            var c: Int = 1
            while c < map.cols - 1 {
                if map.isSolidCell(c, r) {
                    c += 1
                    continue
                }
                let floorBelow: Bool = map.isSolidCell(c, r + 1) && map.isSolidCell(c - 1, r + 1) && map.isSolidCell(c + 1, r + 1)
                let ceilingAbove: Bool = map.isSolidCell(c, r - 1) && map.isSolidCell(c - 1, r - 1) && map.isSolidCell(c + 1, r - 1)
                let x: Double = (Double(c) + 0.5) * ts + rng.range(-4, 4)
                if floorBelow && !map.isSolidCell(c, r - 1) {
                    let y: Double = surfaceY(map, x: x, from: Double(r) * ts, direction: 1)
                    let roll: Double = rng.unit()
                    switch zone.shape {
                    case "bowl":
                        if roll < 0.62 { props.append(MapProp(kind: .posidonia, x: x, y: y, variant: rng.int(0, 2), hanging: false)) }
                        else if roll < 0.66 { props.append(MapProp(kind: .sponge, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                    case "ledges":
                        if roll < 0.22 { props.append(MapProp(kind: .gorgonia, x: x, y: y, variant: rng.int(0, 2), hanging: false)) }
                        else if roll < 0.34 { props.append(MapProp(kind: .sponge, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                        else if roll < 0.44 { props.append(MapProp(kind: .anemone, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                        else if roll < 0.52 { props.append(MapProp(kind: .posidonia, x: x, y: y, variant: rng.int(0, 2), hanging: false)) }
                    case "open":
                        if roll < 0.12 { props.append(MapProp(kind: .gorgonia, x: x, y: y, variant: rng.int(0, 2), hanging: false)) }
                        else if roll < 0.20 { props.append(MapProp(kind: .sponge, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                    case "ruins":
                        if roll < 0.10 { props.append(MapProp(kind: .anemone, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                        else if roll < 0.16 { props.append(MapProp(kind: .column, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                    case "chimneys":
                        if roll < 0.08 { props.append(MapProp(kind: .vent, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                        else if roll < 0.14 { props.append(MapProp(kind: .crystal, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                    default:
                        if roll < 0.10 { props.append(MapProp(kind: .crystal, x: x, y: y, variant: rng.int(0, 1), hanging: false)) }
                    }
                } else if ceilingAbove && !map.isSolidCell(c, r + 1) {
                    let roll: Double = rng.unit()
                    if zone.shape == "ledges" && roll < 0.16 {
                        let y: Double = surfaceY(map, x: x, from: (Double(r) + 1) * ts, direction: -1)
                        props.append(MapProp(kind: .gorgonia, x: x, y: y, variant: rng.int(0, 2), hanging: true))
                    }
                }
                c += 1
            }
            r += 1
        }
        // Corde di risalita lungo il canale principale: la prima è l'ancora della barca.
        var depth: Double = 0
        while depth < Double(map.rows) - 20 {
            let p: Vec2 = map.channelPoint(depthMeters: depth + 3)
            props.append(MapProp(kind: .rope, x: p.x, y: p.y, variant: depth == 0 ? 0 : 1, hanging: false))
            depth += depth == 0 ? 45 : 70
        }
        map.props = props
    }

    /// Cerca lungo la verticale il punto in cui comincia la roccia, per appoggiare bene gli oggetti.
    private static func surfaceY(_ map: CaveMap, x: Double, from start: Double, direction: Double) -> Double {
        var y: Double = start
        var steps: Int = 0
        while steps < 40 && map.density(x: x, y: y) < 0.5 {
            y += direction
            steps += 1
        }
        return y
    }
}
