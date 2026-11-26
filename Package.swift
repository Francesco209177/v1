// swift-tools-version:5.9
// Pacchetto di servizio: compila e testa la sola logica pura (nessun framework Apple),
// così gira anche su Linux e in CI senza simulatore. L'app vera si genera con XcodeGen.
import PackageDescription

// Cartelle con codice che importa solo Foundation.
let pureSources: [String] = [
    "Core/Model",
    "Art/Model",
    "Diving/Model",
    "Restaurant/Model",
    "Story/Model",
    "Hub/Model",
    "Audio/Synth"
]

// Presentazione portabile (Android e strumenti su Linux): disegna il gioco in memoria,
// senza SpriteKit né SwiftUI, riusando tutta la logica pura. Sta nello stesso modulo.
let portableSources: [String] = [
    "Portable/Engine",
    "Portable/Game",
    "Portable/Bridge"
]

let package = Package(
    name: "MareaLogic",
    products: [
        .library(name: "MareaLogic", targets: ["MareaLogic"]),
        // Libreria caricata dall'app Android: logica, presentazione portabile e ponte JNI.
        .library(name: "MareaProfonda", type: .dynamic, targets: ["MareaLogic", "CMareaJNI"])
    ],
    targets: [
        .target(
            name: "MareaLogic",
            path: ".",
            // Fuori dal modulo tutto ciò che non è sorgente: in particolare le risorse dell'app iOS,
            // che altrimenti SwiftPM impacchetterebbe generando codice che importa Foundation completo.
            exclude: [
                "MareaProfonda/Resources",
                "MareaProfonda/Data",
                "Android",
                "Tools",
                "Tests",
                "Portable/CJNI",
                "Portable/Runner",
                "README.md",
                "project.yml",
                "xauusd_intraday_strategy.pine"
            ],
            sources: pureSources.map { "MareaProfonda/" + $0 } + portableSources
        ),
        .target(
            name: "CMareaJNI",
            path: "Portable/CJNI"
        ),
        // Strumento su Linux che fa girare la versione portabile senza schermo e ne salva le istantanee.
        .executableTarget(
            name: "runner",
            dependencies: ["MareaLogic"],
            path: "Portable/Runner"
        ),
        .executableTarget(
            name: "preview",
            dependencies: ["MareaLogic"],
            path: "Tools/preview"
        ),
        .testTarget(
            name: "MareaLogicTests",
            dependencies: ["MareaLogic"],
            path: "Tests/MareaLogicTests"
        )
    ]
)
