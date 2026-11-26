import Metal
import SpriteKit
import UIKit

/// Prova automatica usata dalla CI: avviata con l'argomento `-smoke`, l'app percorre da sola
/// le scene, scrive righe `SMOKE ...` sullo standard output e termina. Serve a scoprire
/// crash all'avvio, risorse mancanti ed errori degli shader senza un dispositivo.
enum SmokeTest {
    static let isActive: Bool = ProcessInfo.processInfo.arguments.contains("-smoke")
    static let wantsCanary: Bool = ProcessInfo.processInfo.arguments.contains("-smoke-canary")

    static func log(_ message: String) {
        let line: String = "SMOKE " + message + "\n"
        FileHandle.standardOutput.write(Data(line.utf8))
    }
}

final class SmokeRunner {
    struct Stage {
        let name: String
        let make: (CGSize) -> BaseScene
    }

    private weak var view: SKView?
    private var stages: [Stage] = []
    private var index: Int = 0
    private var failures: Int = 0

    init(view: SKView) {
        self.view = view
        if SmokeTest.wantsCanary {
            stages = [Stage(name: "canary", make: { (size: CGSize) -> BaseScene in ShaderCanaryScene(size: size) })]
        } else {
            stages = SmokeRunner.gameStages()
        }
    }

    /// Elenco delle scene percorse dalla prova. Ogni nuova scena del gioco va aggiunta qui.
    static func gameStages() -> [Stage] {
        return [
            Stage(name: "title", make: { (size: CGSize) -> BaseScene in TitleScene(size: size) })
        ]
    }

    func start() {
        let device: String = MTLCreateSystemDefaultDevice()?.name ?? "nessuno"
        let bounds: CGSize = view?.bounds.size ?? CGSize.zero
        let scale: CGFloat = view?.traitCollection.displayScale ?? 0
        SmokeTest.log("START metal=\(device) view=\(Int(bounds.width))x\(Int(bounds.height)) scale=\(scale)")
        let forge: SpriteForge = SpriteForge.shared
        SmokeTest.log("FORGE sprites=\(forge.spriteCount) pages=\(forge.pageCount) cache=\(forge.loadedFromCache)")
        for problem in forge.problems {
            failures += 1
            SmokeTest.log("FAIL forge \(problem)")
        }
        advance()
    }

    private func advance() {
        guard let view: SKView = view else { return }
        if index >= stages.count {
            SmokeTest.log(failures == 0 ? "DONE" : "FAILED count=\(failures)")
            DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 0.5) {
                exit(0)
            }
            return
        }
        let stage: Stage = stages[index]
        index += 1
        let scene: BaseScene = stage.make(view.bounds.size)
        SmokeTest.log("BEGIN \(stage.name)")
        view.presentScene(scene)
        DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 3.0) { [weak self, weak scene] in
            guard let self = self else { return }
            let frames: Int = scene?.frameCount ?? 0
            let nodes: Int = scene.map { SmokeRunner.countNodes($0) } ?? 0
            if frames < 30 {
                self.failures += 1
                SmokeTest.log("FAIL \(stage.name) solo \(frames) fotogrammi in 3 secondi")
            } else {
                SmokeTest.log("OK \(stage.name) frames=\(frames) nodes=\(nodes)")
            }
            for problem in SpriteForge.shared.problems where problem.hasPrefix("sprite mancante") {
                self.failures += 1
                SmokeTest.log("FAIL \(stage.name) \(problem)")
            }
            SmokeTest.log("SHOT \(stage.name)")
            DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 2.5) { [weak self] in
                self?.advance()
            }
        }
    }

    private static func countNodes(_ node: SKNode) -> Int {
        var total: Int = 1
        for child in node.children { total += countNodes(child) }
        return total
    }
}
