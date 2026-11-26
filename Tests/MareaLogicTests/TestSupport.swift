import Foundation
import XCTest
@testable import MareaLogic

enum TestSupport {
    /// Radice del repository, ricavata dalla posizione di questo file.
    static var repoRoot: URL {
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    static var spritesDirectory: URL {
        return repoRoot.appendingPathComponent("MareaProfonda/Resources/Sprites")
    }

    static var dataDirectory: URL {
        return repoRoot.appendingPathComponent("MareaProfonda/Data")
    }

    static func loadSpriteLibrary() throws -> SpriteLibrary {
        var library: SpriteLibrary = SpriteLibrary()
        let files: [URL] = try FileManager.default.contentsOfDirectory(at: spritesDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "spr" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        for url in files {
            let text: String = try String(contentsOf: url, encoding: String.Encoding.utf8)
            try library.parse(text: text, fileName: url.lastPathComponent)
        }
        return library
    }
}
