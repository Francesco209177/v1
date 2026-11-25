import SwiftUI

@main
struct BackupNASApp: App {
    @StateObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Va registrato prima che l'app finisca l'avvio.
        BackgroundScheduler.register()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .environmentObject(model.engine)
                .environmentObject(model.folders)
                .environmentObject(model.inbox)
                .environmentObject(model.log)
                .onOpenURL { url in
                    model.handleIncomingFile(url)
                }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                BackgroundScheduler.schedule(settings: model.settings)
            }
        }
    }
}
