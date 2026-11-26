import Foundation
import MareaLogic

// Strumento su Linux: fa girare la versione portabile del gioco senza schermo e salva istantanee PNG.
// È lo stesso codice che gira su Android, quindi ciò che si vede qui è ciò che si vedrà sul telefono.
//
//   swift run runner smoke <cartella-istantanee> [larghezza altezza]
//
// Esegue la prova automatica (tutte le schermate) simulando uno schermo delle dimensioni date.

let arguments: [String] = CommandLine.arguments
let mode: String = arguments.count > 1 ? arguments[1] : "smoke"
let output: String = arguments.count > 2 ? arguments[2] : "runner-out"
let width: Int = arguments.count > 4 ? (Int(arguments[3]) ?? 1280) : 1280
let height: Int = arguments.count > 4 ? (Int(arguments[4]) ?? 720) : 720
let root: String = FileManager.default.currentDirectoryPath

// Le risorse stanno nel repository: una cartella con dentro Data e Sprites.
let assets: String = root + "/.build/runner-assets"
try? FileManager.default.removeItem(atPath: assets)
try FileManager.default.createDirectory(atPath: assets, withIntermediateDirectories: true)
try FileManager.default.copyItem(atPath: root + "/MareaProfonda/Data", toPath: assets + "/Data")
try FileManager.default.copyItem(atPath: root + "/MareaProfonda/Resources/Sprites", toPath: assets + "/Sprites")
let saves: String = root + "/.build/runner-saves"
try? FileManager.default.removeItem(atPath: saves)

MareaHost.setLog { (text: String) -> Void in print(text) }
MareaHost.boot(assets: assets, saves: saves, width: width, height: height)

if mode == "smoke" {
    MareaHost.startSmoke(directory: output)
    var frames: Int = 0
    var audio: [Int16] = [Int16](repeating: 0, count: 368)
    while !MareaHost.smokeFinished && frames < 60 * 60 * 20 {
        MareaHost.frame(dt: 1.0 / 60.0)
        // Il mixer va tenuto in moto come farebbe il thread audio del telefono.
        audio.withUnsafeMutableBufferPointer { (buffer: inout UnsafeMutableBufferPointer<Int16>) -> Void in
            if let base: UnsafeMutablePointer<Int16> = buffer.baseAddress { MareaHost.renderAudio(into: base, frames: 368) }
        }
        frames += 1
    }
    print("fotogrammi: \(frames)")
    exit(MareaHost.smokeFinished ? 0 : 1)
} else {
    print("modo sconosciuto: \(mode)")
    exit(2)
}
