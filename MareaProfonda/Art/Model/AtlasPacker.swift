/// Posizione di uno sprite dentro una pagina di atlante, in pixel dall'angolo in alto a sinistra.
struct AtlasPlacement: Codable, Equatable {
    let page: Int
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let anchorX: Int
    let anchorY: Int
}

struct AtlasResult {
    var pages: [PixelBuffer]
    var placements: [String: AtlasPlacement]
}

/// Impacchetta gli sprite in poche pagine grandi, così SpriteKit li disegna in pochi passaggi.
/// Algoritmo a scaffali: semplice, deterministico, sufficiente per sprite piccoli.
enum AtlasPacker {
    struct Item {
        let name: String
        let image: PixelBuffer
        let anchorX: Int
        let anchorY: Int
    }

    static func pack(_ items: [Item], pageSize: Int = 1024, padding: Int = 1) -> AtlasResult {
        let sorted: [Item] = items.sorted { (a: Item, b: Item) -> Bool in
            if a.image.height != b.image.height { return a.image.height > b.image.height }
            return a.name < b.name
        }
        var pages: [PixelBuffer] = []
        var placements: [String: AtlasPlacement] = [:]

        var cursorX: Int = padding
        var cursorY: Int = padding
        var shelfHeight: Int = 0
        var current: Int = -1

        func newPage(_ size: Int) -> Int {
            pages.append(PixelBuffer(width: size, height: size))
            return pages.count - 1
        }

        for item in sorted {
            let w: Int = item.image.width
            let h: Int = item.image.height
            // Sprite più grandi della pagina: una pagina dedicata.
            if w + padding * 2 > pageSize || h + padding * 2 > pageSize {
                var size: Int = pageSize
                while size < max(w, h) + padding * 2 { size *= 2 }
                let page: Int = newPage(size)
                pages[page].copy(item.image, toX: padding, y: padding)
                placements[item.name] = AtlasPlacement(page: page, x: padding, y: padding, width: w, height: h, anchorX: item.anchorX, anchorY: item.anchorY)
                continue
            }
            if current < 0 {
                current = newPage(pageSize)
            }
            if cursorX + w + padding > pageSize {
                cursorX = padding
                cursorY += shelfHeight + padding
                shelfHeight = 0
            }
            if cursorY + h + padding > pageSize {
                current = newPage(pageSize)
                cursorX = padding
                cursorY = padding
                shelfHeight = 0
            }
            pages[current].copy(item.image, toX: cursorX, y: cursorY)
            placements[item.name] = AtlasPlacement(page: current, x: cursorX, y: cursorY, width: w, height: h, anchorX: item.anchorX, anchorY: item.anchorY)
            cursorX += w + padding
            shelfHeight = max(shelfHeight, h)
        }
        return AtlasResult(pages: pages, placements: placements)
    }
}
