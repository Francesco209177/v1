// Strumento di anteprima per lo sviluppo: disegna su PNG ciò che il gioco genera a runtime
// con codice puro (atlanti degli sprite, e più avanti terreno e fondali), senza bisogno di iOS.
//
// Uso:  swift run -c release -Xswiftc -enable-testing preview <comando> <cartella di uscita>
//   atlas     pagine dell'atlante degli sprite
//   backdrop  pareti lontane e cieli
//   terrain   veduta d'insieme della mappa e una finestra di roccia per ogni zona
import Foundation
@testable import MareaLogic

let arguments: [String] = CommandLine.arguments
let command: String = arguments.count > 1 ? arguments[1] : "atlas"
let outDir: String = arguments.count > 2 ? arguments[2] : "Tools/forge/out"
let root: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

func loadLibrary() throws -> SpriteLibrary {
    var library: SpriteLibrary = SpriteLibrary()
    let dir: URL = root.appendingPathComponent("MareaProfonda/Resources/Sprites")
    let files: [URL] = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "spr" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    for url in files {
        try library.parse(text: try String(contentsOf: url, encoding: String.Encoding.utf8), fileName: url.lastPathComponent)
    }
    return library
}

do {
    switch command {
    case "atlas":
        let library: SpriteLibrary = try loadLibrary()
        for problem in library.validate() { print("PROBLEMA:", problem) }
        var items: [AtlasPacker.Item] = []
        for sprite in library.expandedSprites() {
            items.append(AtlasPacker.Item(name: sprite.name, image: library.rasterize(sprite), anchorX: sprite.anchorX, anchorY: sprite.anchorY))
        }
        let result: AtlasResult = AtlasPacker.pack(items)
        for (i, page) in result.pages.enumerated() {
            try PNGWriter.write(page, to: "\(outDir)/atlas_page\(i).png")
        }
        print("sprite: \(items.count), pagine: \(result.pages.count)")
    case "terrain":
        let seed: UInt64 = arguments.count > 3 ? (UInt64(arguments[3]) ?? 1) : 1
        let world: WorldData = try DataFiles.load(WorldData.self, file: "zones.json", in: root.appendingPathComponent("MareaProfonda/Data"))
        for problem in world.problems() { print("PROBLEMA:", problem) }
        let started: Date = Date()
        let map: CaveMap = CaveGenerator.generate(seed: seed, world: world)
        print("mappa \(map.cols)x\(map.rows) generata in \(Int(Date().timeIntervalSince(started) * 1000)) ms, oggetti: \(map.props.count)")
        let styles: [TerrainStyle] = TerrainPainter.styles(for: world)
        // Veduta d'insieme: 3 pixel per cella.
        var overview: PixelBuffer = PixelBuffer(width: map.cols * 3, height: map.rows * 3)
        for r in 0..<map.rows {
            let zi: Int = world.zoneIndex(atDepth: Double(r))
            let water: RGBA = RGBA(hexString: world.zones[zi].waterBottom) ?? RGBA.black
            for c in 0..<map.cols {
                let color: RGBA = map.isSolidCell(c, r) ? styles[zi].rock[2] : water
                overview.fillRect(x: c * 3, y: r * 3, width: 3, height: 3, color)
            }
            let cx: Int = Int(map.channel[r])
            overview.set(cx * 3 + 1, r * 3 + 1, RGBA(hex: 0xFFE070))
        }
        for prop in map.props where prop.kind == .rope {
            overview.fillRect(x: Int(prop.x) / map.tileSize * 3 - 1, y: Int(prop.y) / map.tileSize * 3 - 1, width: 5, height: 5, RGBA(hex: 0xFF4040))
        }
        try PNGWriter.write(overview, to: "\(outDir)/map_overview.png")
        // Una finestra per zona, con l'acqua dietro, come si vedrà nel gioco.
        for zone in world.zones {
            let mid: Double = Double(zone.depthFrom) + Double(zone.depthTo - zone.depthFrom) * 0.45
            let center: Vec2 = map.channelPoint(depthMeters: mid)
            let w: Int = 640
            let h: Int = 360
            let ox: Int = max(0, min(Int(center.x) - w / 2, map.cols * map.tileSize - w))
            let oy: Int = max(0, Int(center.y) - h / 2)
            let t0: Date = Date()
            let result: TerrainPainter.Result = TerrainPainter.paint(map: map, world: world, styles: styles, originX: ox, originY: oy, width: w, height: h)
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            let top: RGBA = RGBA(hexString: zone.waterTop) ?? RGBA.black
            let bottom: RGBA = RGBA(hexString: zone.waterBottom) ?? RGBA.black
            var canvas: PixelBuffer = PixelBuffer(width: w, height: h)
            for y in 0..<h {
                let color: RGBA = top.mixed(with: bottom, Double(y) / Double(h))
                canvas.fillRect(x: 0, y: y, width: w, height: 1, color)
            }
            canvas.draw(result.image, atX: 0, y: 0)
            for prop in map.props {
                let x: Int = Int(prop.x) - ox
                let y: Int = Int(prop.y) - oy
                if x >= 0 && x < w && y >= 0 && y < h {
                    canvas.fillRect(x: x - 1, y: y - (prop.hanging ? 0 : 5), width: 2, height: 5, RGBA(hex: prop.kind == .rope ? 0xFF4040 : 0x40FF90))
                }
            }
            try PNGWriter.write(canvas, to: "\(outDir)/terrain_\(zone.id).png")
            print("\(zone.id): finestra \(w)x\(h) dipinta in \(ms) ms")
        }
    case "arena":
        // Le sale dei boss, una sotto l'altra: roccia, tane, campane, punti di partenza.
        let world: WorldData = try DataFiles.load(WorldData.self, file: "zones.json", in: root.appendingPathComponent("MareaProfonda/Data"))
        let bosses: BossBook = try DataFiles.load(BossBook.self, file: "bosses.json", in: root.appendingPathComponent("MareaProfonda/Data"))
        let styles: [TerrainStyle] = TerrainPainter.styles(for: world)
        let w: Int = 800
        let h: Int = 300
        var sheet: PixelBuffer = PixelBuffer(width: w, height: h * bosses.bosses.count)
        for (index, info) in bosses.bosses.enumerated() {
            let built: (map: CaveMap, arena: Arena) = CaveGenerator.arena(seed: 7, world: world, boss: info)
            let arena: Arena = built.arena
            let ox: Int = Int(arena.center.x) - w / 2
            let oy: Int = Int(arena.center.y) - h / 2
            let zone: ZoneInfo = world.zone(atDepth: info.depth) ?? world.zones[0]
            let water: RGBA = (RGBA(hexString: zone.waterTop) ?? RGBA.black).mixed(with: RGBA(hexString: zone.waterBottom) ?? RGBA.black, 0.5)
            var canvas: PixelBuffer = PixelBuffer(width: w, height: h)
            canvas.fillRect(x: 0, y: 0, width: w, height: h, water)
            canvas.draw(TerrainPainter.paint(map: built.map, world: world, styles: styles, originX: ox, originY: oy, width: w, height: h).image, atX: 0, y: 0)
            func mark(_ p: Vec2, _ color: RGBA, _ size: Int) {
                canvas.fillRect(x: Int(p.x) - ox - size / 2, y: Int(p.y) - oy - size / 2, width: size, height: size, color)
            }
            for hole in arena.holes { mark(hole.position, RGBA(hex: 0xFFE040), 8) }
            for bell in arena.bells { mark(bell, RGBA(hex: 0x60E0FF), 8) }
            mark(arena.diverStart, RGBA(hex: 0x40FF90), 10)
            mark(arena.bossStart, RGBA(hex: 0xFF5050), Int(info.radius * 2))
            // Riquadro dello schermo (circa 520 x 240 pixel d'arte) attorno a Tecla.
            for x in 0..<520 where x % 4 < 2 {
                canvas.set(Int(arena.center.x) - ox - 260 + x, Int(arena.center.y) - oy - 120, RGBA(hex: 0xFFFFFF))
                canvas.set(Int(arena.center.x) - ox - 260 + x, Int(arena.center.y) - oy + 120, RGBA(hex: 0xFFFFFF))
            }
            sheet.draw(canvas, atX: 0, y: index * h)
            print("\(info.id): sala \(Int(arena.width)) x \(Int(arena.height)), tane \(arena.holes.count)")
        }
        try PNGWriter.write(sheet, to: "\(outDir)/arenas.png")

    case "backdrop":
        let far: PixelBuffer = BackdropPainter.rockLayer(size: 256, seed: 11, cellsX: 5, cellsY: 2, coverage: 0.42, softEdge: 0.03)
        let mid: PixelBuffer = BackdropPainter.rockLayer(size: 256, seed: 22, cellsX: 6, cellsY: 3, coverage: 0.36, softEdge: 0.015)
        let near: PixelBuffer = BackdropPainter.rockLayer(size: 512, seed: 33, cellsX: 7, cellsY: 4, coverage: 0.30, softEdge: 0)
        try PNGWriter.write(far, to: "\(outDir)/backdrop_far.png")
        try PNGWriter.write(mid, to: "\(outDir)/backdrop_mid.png")
        try PNGWriter.write(near, to: "\(outDir)/backdrop_near.png")
        let styles: [(String, BackdropPainter.SkyStyle)] = [("morning", .morning), ("afternoon", .afternoon), ("evening", .evening), ("night", .night)]
        for (name, style) in styles {
            try PNGWriter.write(BackdropPainter.sky(width: 640, height: 150, seed: 4, style: style), to: "\(outDir)/sky_\(name).png")
        }
        try PNGWriter.write(BackdropPainter.surfaceStrip(width: 256, height: 10, phase: 0), to: "\(outDir)/surface.png")
        print("fondali scritti")
    default:
        print("comando sconosciuto: \(command)")
        exit(2)
    }
} catch {
    print("errore: \(error)")
    exit(1)
}
