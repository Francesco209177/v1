import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var inbox: InboxStore

    var body: some View {
        TabView(selection: $model.selectedTab) {
            BackupView()
                .tabItem { Label("Backup", systemImage: "externaldrive.badge.checkmark") }
                .tag(AppTab.backup)
            FoldersView()
                .tabItem { Label("Cartelle", systemImage: "folder") }
                .tag(AppTab.folders)
            InboxView()
                .tabItem { Label("Ricevuti", systemImage: "tray.and.arrow.down") }
                .badge(inbox.pendingItems.count)
                .tag(AppTab.inbox)
            SettingsView()
                .tabItem { Label("Impostazioni", systemImage: "gearshape") }
                .tag(AppTab.settings)
        }
    }
}

extension Date {
    /// "oggi 10:30", "ieri 22:15", "3 nov 2026 09:00".
    var friendly: String {
        let calendar = Calendar.current
        let time = formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(self) { return "oggi \(time)" }
        if calendar.isDateInYesterday(self) { return "ieri \(time)" }
        return formatted(date: .abbreviated, time: .shortened)
    }
}
