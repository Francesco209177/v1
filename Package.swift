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
    "Hub/Model"
]

let package = Package(
    name: "MareaLogic",
    products: [
        .library(name: "MareaLogic", targets: ["MareaLogic"])
    ],
    targets: [
        .target(
            name: "MareaLogic",
            path: "MareaProfonda",
            sources: pureSources
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
