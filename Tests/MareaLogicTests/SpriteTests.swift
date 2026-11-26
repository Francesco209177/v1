import XCTest
@testable import MareaLogic

final class SpriteTests: XCTestCase {

    func testBundledSpriteFilesParseAndValidate() throws {
        let library: SpriteLibrary = try TestSupport.loadSpriteLibrary()
        XCTAssertFalse(library.sprites.isEmpty)
        let problems: [String] = library.validate()
        XCTAssertTrue(problems.isEmpty, problems.joined(separator: "\n"))
    }

    func testRequiredSpritesExist() throws {
        let library: SpriteLibrary = try TestSupport.loadSpriteLibrary()
        let names: Set<String> = Set(library.expandedSprites().map { $0.name })
        for required in ["tecla_swim_0", "tecla_swim_5", "tecla_idle_0", "bubble_0", "font_48", "font_65"] {
            XCTAssertTrue(names.contains(required), "manca \(required)")
        }
    }

    func testParserRejectsMalformedRows() {
        var library: SpriteLibrary = SpriteLibrary()
        let bad: String = "palette p\na ff0000ff\nend\nsprite x 3 2 p\naaa\naa\nend\n"
        XCTAssertThrowsError(try library.parse(text: bad, fileName: "bad.spr"))
    }

    func testRasterizeAndVariants() throws {
        var library: SpriteLibrary = SpriteLibrary()
        let text: String = """
        palette base
        a ff0000ff
        end
        palette oro
        a ffcc00ff
        end
        sprite pesce_0 2 2 base ax=1 ay=1
        a.
        .a
        end
        variant pesce_oro pesce base_non_usata
        variant pesce_dorato pesce oro
        """
        try library.parse(text: text, fileName: "t.spr")
        let all: [IndexedSprite] = library.expandedSprites()
        XCTAssertEqual(all.count, 3)
        let gold: IndexedSprite? = all.first { $0.name == "pesce_dorato_0" }
        XCTAssertNotNil(gold)
        if let gold = gold {
            let image: PixelBuffer = library.rasterize(gold)
            XCTAssertEqual(image.get(0, 0), RGBA(hex: 0xFFCC00))
            XCTAssertEqual(image.get(1, 0), RGBA.clear)
        }
        // La palette inesistente deve risultare tra i problemi.
        XCTAssertFalse(library.validate().isEmpty)
    }

    func testAtlasPackerKeepsEverySpriteIntact() throws {
        let library: SpriteLibrary = try TestSupport.loadSpriteLibrary()
        var items: [AtlasPacker.Item] = []
        for sprite in library.expandedSprites() {
            items.append(AtlasPacker.Item(name: sprite.name, image: library.rasterize(sprite), anchorX: sprite.anchorX, anchorY: sprite.anchorY))
        }
        let result: AtlasResult = AtlasPacker.pack(items, pageSize: 256, padding: 1)
        XCTAssertEqual(result.placements.count, items.count)
        var rects: [(Int, Int, Int, Int, Int)] = []
        for item in items {
            guard let place: AtlasPlacement = result.placements[item.name] else {
                XCTFail("manca \(item.name)")
                continue
            }
            let page: PixelBuffer = result.pages[place.page]
            XCTAssertTrue(place.x >= 1 && place.y >= 1 && place.x + place.width < page.width && place.y + place.height < page.height)
            for y in 0..<item.image.height {
                for x in 0..<item.image.width where item.image.get(x, y) != page.get(place.x + x, place.y + y) {
                    XCTFail("\(item.name): pixel diverso in \(x),\(y)")
                    return
                }
            }
            rects.append((place.page, place.x, place.y, place.width, place.height))
        }
        // Nessuna sovrapposizione, con un pixel di margine.
        for i in 0..<rects.count {
            for j in (i + 1)..<rects.count where rects[i].0 == rects[j].0 {
                let a = rects[i]
                let b = rects[j]
                let apart: Bool = a.1 + a.3 < b.1 || b.1 + b.3 < a.1 || a.2 + a.4 < b.2 || b.2 + b.4 < a.2
                XCTAssertTrue(apart, "sovrapposizione tra sprite nell'atlante")
            }
        }
    }

    func testPixelBufferBlendAndPremultiply() {
        var buffer: PixelBuffer = PixelBuffer(width: 2, height: 1, fill: RGBA(r: 0, g: 0, b: 255, a: 255))
        buffer.blend(0, 0, RGBA(r: 255, g: 0, b: 0, a: 128))
        let mixed: RGBA = buffer.get(0, 0)
        XCTAssertTrue(mixed.r > 120 && mixed.r < 136 && mixed.b > 120 && mixed.b < 136 && mixed.a == 255)
        buffer.set(1, 0, RGBA(r: 200, g: 100, b: 50, a: 128))
        let pre: [UInt8] = buffer.premultipliedData()
        XCTAssertEqual(pre[4], 100)
        XCTAssertEqual(pre[7], 128)
    }
}
