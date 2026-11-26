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
        /// Secondi di osservazione prima della schermata.
        var seconds: Double = 3.0
        /// Schermata di menu da mostrare sopra la scena, se serve.
        var overlay: OverlayScreen? = nil
        let make: (CGSize) -> BaseScene
    }

    private weak var view: SKView?
    private var stages: [Stage] = []
    private var index: Int = 0
    private var failures: Int = 0
    private var reported: Set<String> = []

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
        func dive(_ depth: Double, _ auto: Vec2) -> (CGSize) -> BaseScene {
            return { (size: CGSize) -> BaseScene in
                var config: DiveScene.Config = DiveScene.Config()
                config.seed = 7
                config.startDepthMeters = depth
                config.autopilot = auto
                config.autoFire = true
                return DiveScene(size: size, config: config)
            }
        }
        // Partita di prova, mai salvata: una dispensa fornita per mostrare menu e servizio.
        func demo(_ phase: DayPhase) -> GameState {
            var state: GameState = GameState()
            state.seed = 7
            state.day = 3
            state.phase = phase
            state.gold = 135
            state.fame = 46
            state.pantry.add("sardina", stars: 2, count: 9)
            state.pantry.add("castagnola", stars: 2, count: 6)
            state.pantry.add("triglia", stars: 2, count: 4)
            state.pantry.add("orata", stars: 3, count: 2)
            state.pantry.add("riccio", stars: 0, count: 6)
            state.pantry.add("alga", stars: 0, count: 4)
            state.fishLog["orata"] = FishRecord(caught: 2, bestStars: 3)
            state.fishLog["triglia"] = FishRecord(caught: 4, bestStars: 2)
            state.fishLog["sardina"] = FishRecord(caught: 9, bestStars: 2)
            state.quests.progress["ines_ricci"] = QuestProgress(count: 6, done: true)
            state.quests.progress["bianca_saraghi"] = QuestProgress(count: 1, done: false)
            return state
        }
        func hub(_ phase: DayPhase) -> (CGSize) -> BaseScene {
            return { (size: CGSize) -> BaseScene in
                GameSession.shared.startEphemeral(demo(phase))
                return HubScene(size: size, phase: phase)
            }
        }
        let service: (CGSize) -> BaseScene = { (size: CGSize) -> BaseScene in
            GameSession.shared.startEphemeral(demo(DayPhase.evening))
            _ = GameSession.shared.prepareMenu([(recipeId: "sarde_beccafico", batches: 2), (recipeId: "orata_sale", batches: 1),
                                                (recipeId: "spaghetti_ricci", batches: 1)])
            guard let setup: ServiceSetup = GameSession.shared.serviceSetup() else {
                SmokeTest.log("FAIL service menu non preparato")
                return TitleScene(size: size)
            }
            var config: RestaurantScene.Config = RestaurantScene.Config(setup: setup)
            config.autopilot = true
            return RestaurantScene(size: size, config: config)
        }
        return [
            Stage(name: "title", make: { (size: CGSize) -> BaseScene in TitleScene(size: size) }),
            Stage(name: "slots", overlay: OverlayScreen.slots, make: { (size: CGSize) -> BaseScene in TitleScene(size: size) }),
            Stage(name: "dive_surface", make: dive(0, Vec2(0.55, -0.45))),
            Stage(name: "dive_posidonia", seconds: 8, make: dive(24, Vec2(-0.7, -0.15))),
            Stage(name: "dive_gorgonie", seconds: 8, make: dive(72, Vec2(0.7, 0.1))),
            Stage(name: "dive_citta", make: dive(290, Vec2(0.6, -0.2))),
            Stage(name: "dive_fumarole", make: dive(440, Vec2(-0.6, -0.3))),
            Stage(name: "hub_morning", overlay: OverlayScreen.hub, make: hub(DayPhase.morning)),
            Stage(name: "hub_evening", overlay: OverlayScreen.hub, make: hub(DayPhase.evening)),
            Stage(name: "menu", overlay: OverlayScreen.menu, make: hub(DayPhase.evening)),
            Stage(name: "logbook", overlay: OverlayScreen.logbook, make: hub(DayPhase.morning)),
            Stage(name: "dive_night", seconds: 6, make: { (size: CGSize) -> BaseScene in
                var config: DiveScene.Config = DiveScene.Config()
                config.seed = 7
                config.night = true
                config.sky = BackdropPainter.SkyStyle.night
                config.startDepthMeters = 18
                config.autopilot = Vec2(0.6, -0.2)
                config.autoFire = true
                config.weapon = GameData.shared.upgrades.weapon("rete")
                config.phaseLabel = "Notte"
                return DiveScene(size: size, config: config)
            }),
            Stage(name: "service", seconds: 24, make: service)
        ] + storyStages()
    }

    /// Scene della storia e scontri con i boss: una scena per tipo di luogo, e tutti e sei i boss.
    private static func storyStages() -> [Stage] {
        func cutscene(_ id: String) -> (CGSize) -> BaseScene {
            return { (size: CGSize) -> BaseScene in
                guard let found: Cutscene = GameData.shared.cutscenes.find(id) else {
                    SmokeTest.log("FAIL scena assente: \(id)")
                    return TitleScene(size: size)
                }
                let scene: CutsceneScene = CutsceneScene(size: size, cutscene: found)
                scene.autoAdvance = 0.9
                return scene
            }
        }
        func boss(_ id: String) -> (CGSize) -> BaseScene {
            return { (size: CGSize) -> BaseScene in
                guard let info: BossInfo = GameData.shared.bosses.find(id) else {
                    SmokeTest.log("FAIL boss assente: \(id)")
                    return TitleScene(size: size)
                }
                var config: DiveScene.Config = DiveScene.Config()
                config.seed = 7
                config.boss = info
                config.startDepthMeters = info.depth
                config.autopilot = Vec2(0.5, 0)
                config.autoFire = true
                config.harpoonDamage = 30
                config.torchRadius = 0.27
                return DiveScene(size: size, config: config)
            }
        }
        var stages: [Stage] = [
            Stage(name: "scena_porto", seconds: 7, make: cutscene("s_ritorno")),
            Stage(name: "scena_osteria", seconds: 5, make: cutscene("s_prima_sera")),
            Stage(name: "scena_citta", seconds: 6, make: cutscene("s_citta")),
            Stage(name: "scena_sagra", seconds: 5, make: cutscene("s_sagra")),
            Stage(name: "hub_storia", overlay: OverlayScreen.hub, make: { (size: CGSize) -> BaseScene in
                var state: GameState = GameState()
                state.seed = 7
                state.gold = 220
                state.fame = 60
                state.story.beat = 4
                state.story.introSeen = true
                GameSession.shared.startEphemeral(state)
                return HubScene(size: size, phase: DayPhase.morning)
            })
        ]
        for info in GameData.shared.bosses.bosses {
            stages.append(Stage(name: "boss_\(info.id)", seconds: 9, make: boss(info.id)))
        }
        // Il paese: la schermata con personale, orto e collezione, e i tre giochi del bar che si giocano da soli.
        stages.append(Stage(name: "paese", overlay: OverlayScreen.village, make: { (size: CGSize) -> BaseScene in
            var state: GameState = GameState()
            state.seed = 7
            state.day = 9
            state.gold = 900
            state.fame = 150
            state.flags["beat_c1_baronessa"] = true
            state.village.staff = ["nunzia"]
            state.village.plots = [PlotState(crop: "pomodoro", plantedDay: 5), PlotState()]
            state.village.traps = [TrapState(zone: 0)]
            state.village.collection = ["tile_1", "tile_4", "card_1"]
            GameSession.shared.startEphemeral(state)
            return HubScene(size: size, phase: DayPhase.morning)
        }))
        stages.append(Stage(name: "bar_bocce", seconds: 9, make: { (size: CGSize) -> BaseScene in
            let scene: BocceScene = BocceScene(size: size, seed: 7)
            scene.autoplay = true
            return scene
        }))
        stages.append(Stage(name: "bar_cabinato", seconds: 7, make: { (size: CGSize) -> BaseScene in
            let scene: ArcadeScene = ArcadeScene(size: size, seed: 7)
            scene.autoplay = true
            return scene
        }))
        stages.append(Stage(name: "bar_sfida", seconds: 8, make: { (size: CGSize) -> BaseScene in
            let scene: RhythmScene = RhythmScene(size: size, seed: 7)
            scene.autoplay = true
            return scene
        }))
        return stages
    }

    func start() {
        let device: String = MTLCreateSystemDefaultDevice()?.name ?? "nessuno"
        let bounds: CGSize = view?.bounds.size ?? CGSize.zero
        let scale: CGFloat = view?.traitCollection.displayScale ?? 0
        SmokeTest.log("START metal=\(device) view=\(Int(bounds.width))x\(Int(bounds.height)) scale=\(scale)")
        let forge: SpriteForge = SpriteForge.shared
        SmokeTest.log("FORGE sprites=\(forge.spriteCount) pages=\(forge.pageCount) cache=\(forge.loadedFromCache)")
        SmokeTest.log("AUDIO \(AudioDirector.shared.status)")
        for problem in forge.problems {
            failures += 1
            SmokeTest.log("FAIL forge \(problem)")
        }
        for problem in GameData.shared.problems {
            failures += 1
            SmokeTest.log("FAIL data \(problem)")
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
        OverlayCenter.shared.show(nil)
        let scene: BaseScene = stage.make(view.bounds.size)
        SmokeTest.log("BEGIN \(stage.name)")
        view.presentScene(scene)
        OverlayCenter.shared.show(stage.overlay)
        waitForFirstFrames(scene: scene, stage: stage, attempts: 0)
    }

    /// Il simulatore può metterci secondi a disegnare il primo fotogramma (compila gli shader):
    /// la misura parte solo quando la scena ha cominciato a girare.
    private func waitForFirstFrames(scene: BaseScene, stage: Stage, attempts: Int) {
        if scene.frameCount < 3 && attempts < 80 {
            DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 0.5) { [weak self] in
                self?.waitForFirstFrames(scene: scene, stage: stage, attempts: attempts + 1)
            }
            return
        }
        let startFrames: Int = scene.frameCount
        DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + stage.seconds) { [weak self] in
            guard let self = self else { return }
            let frames: Int = scene.frameCount - startFrames
            let nodes: Int = SmokeRunner.countNodes(scene)
            if Double(frames) < stage.seconds * 7 {
                self.failures += 1
                SmokeTest.log("FAIL \(stage.name) solo \(frames) fotogrammi in \(Int(stage.seconds)) secondi")
            } else {
                SmokeTest.log("OK \(stage.name) frames=\(frames) nodes=\(nodes) \(scene.debugSummary)")
            }
            for problem in SpriteForge.shared.problems where problem.hasPrefix("sprite mancante") && !self.reported.contains(problem) {
                self.reported.insert(problem)
                self.failures += 1
                SmokeTest.log("FAIL \(stage.name) \(problem)")
            }
            self.capture(name: stage.name)
            DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 0.4) { [weak self] in
                self?.advance()
            }
        }
    }

    /// Salva la schermata dall'interno dell'app, così corrisponde di sicuro alla scena in corso.
    /// Lo script della CI la recupera dal contenitore dell'app nel simulatore.
    private func capture(name: String) {
        guard let view: SKView = view else { return }
        let renderer: UIGraphicsImageRenderer = UIGraphicsImageRenderer(bounds: view.bounds)
        let image: UIImage = renderer.image { (_: UIGraphicsImageRendererContext) -> Void in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        let directory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("smoke", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            if let data: Data = image.pngData() {
                try data.write(to: directory.appendingPathComponent(name + ".png"))
                SmokeTest.log("SAVED \(name) \(Int(image.size.width * image.scale))x\(Int(image.size.height * image.scale))")
            }
        } catch {
            SmokeTest.log("NOTE schermata non salvata: \(error)")
        }
    }

    private static func countNodes(_ node: SKNode) -> Int {
        var total: Int = 1
        for child in node.children { total += countNodes(child) }
        return total
    }
}
