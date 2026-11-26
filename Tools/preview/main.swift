// Strumento di anteprima per lo sviluppo: disegna su PNG ciò che il gioco genera a runtime
// con codice puro (atlanti degli sprite, e più avanti terreno e fondali), senza bisogno di iOS.
//
// Uso:  swift run -c release -Xswiftc -enable-testing preview <comando> <cartella di uscita>
//   atlas     pagine dell'atlante e impronte degli sprite
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
    default:
        print("comando sconosciuto: \(command)")
        exit(2)
    }
} catch {
    print("errore: \(error)")
    exit(1)
}
