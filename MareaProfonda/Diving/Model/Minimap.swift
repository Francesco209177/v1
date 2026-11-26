extension DiveSim {
    /// Minimappa attorno a Tecla: un pixel per metro. Roccia, acqua, pesci (bianco i tranquilli,
    /// rosso chi attacca, verde le specie protette), oggetti e campane d'aria.
    /// `blink` fa lampeggiare le specie rare.
    func minimap(cols: Int, rows: Int, blink: Bool) -> PixelBuffer {
        var image: PixelBuffer = PixelBuffer(width: cols, height: rows)
        let ts: Double = Double(map.tileSize)
        let centerC: Int = Int(diver.position.x / ts)
        let centerR: Int = Int(diver.position.y / ts)
        let c0: Int = centerC - cols / 2
        let r0: Int = centerR - rows / 2
        let water: RGBA = RGBA(r: 18, g: 52, b: 92, a: 215)
        let sky: RGBA = RGBA(r: 120, g: 190, b: 230, a: 215)
        let rock: RGBA = RGBA(r: 92, g: 98, b: 122, a: 235)
        var y: Int = 0
        while y < rows {
            var x: Int = 0
            while x < cols {
                let r: Int = r0 + y
                let c: Int = c0 + x
                if r < 0 {
                    image.set(x, y, sky)
                } else {
                    image.set(x, y, map.isSolidCell(c, r) ? rock : water)
                }
                x += 1
            }
            y += 1
        }

        func plot(_ p: Vec2, _ color: RGBA, big: Bool = false) {
            let x: Int = Int(p.x / ts) - c0
            let y: Int = Int(p.y / ts) - r0
            image.set(x, y, color)
            if big {
                image.set(x + 1, y, color)
                image.set(x, y + 1, color)
                image.set(x + 1, y + 1, color)
            }
        }

        for pickup in pickups where !pickup.taken {
            plot(pickup.position, pickup.kind == PickupPoint.Kind.campana ? RGBA(hex: 0x6FD8FF) : RGBA(hex: 0xF2C83A), big: pickup.kind == PickupPoint.Kind.campana)
        }
        for school in schools where school.aliveCount > 0 {
            plot(school.center, RGBA(hex: 0x9FEFFF), big: true)
        }
        for f in fish where f.isAlive {
            let species: FishSpecies = f.species
            var color: RGBA = RGBA.white
            if species.isProtected {
                color = RGBA(hex: 0x6FE08A)
            } else if species.damage > 0 {
                color = RGBA(hex: 0xFF5A50)
            }
            if species.rarity >= 4 && blink { color = RGBA(hex: 0xFF7AF0) }
            plot(f.position, color, big: species.rarity >= 3)
        }
        plot(boat, RGBA(hex: 0xF4EFE2), big: true)
        plot(diver.position, RGBA(hex: 0xFF9A2E), big: true)
        return image
    }
}
