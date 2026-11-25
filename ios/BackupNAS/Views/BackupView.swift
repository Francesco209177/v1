import SwiftUI

struct BackupView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var engine: BackupEngine

    var body: some View {
        NavigationStack {
            List {
                statusSection
                Section {
                    ForEach(BackupCategory.allCases) { category in
                        Toggle(isOn: model.binding(for: category)) {
                            CategoryRow(category: category)
                        }
                        .disabled(engine.isRunning)
                    }
                } header: {
                    Text("Cosa salvare")
                } footer: {
                    Text("Foto e video non sono inclusi (li gestisci con Immich). Le chat WhatsApp si salvano dalla scheda Ricevuti.")
                }
                actionSection
            }
            .navigationTitle("Backup NAS")
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        Section {
            if model.settings.isConfigured {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(SMBService.normalizedHost(model.settings.host)).font(.headline)
                        Text("\(model.settings.share)/\(model.settings.deviceRoot)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "server.rack")
                }
            } else {
                Button {
                    model.selectedTab = .settings
                } label: {
                    Label("Configura il NAS in Impostazioni", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
            if let summary = engine.lastSummary {
                Label(summary, systemImage: "clock.arrow.circlepath")
                    .font(.subheadline)
            }
        } footer: {
            Text("Fuori casa tieni attivo Tailscale sull'iPhone: l'app raggiunge il NAS col suo indirizzo Tailscale.")
        }
    }

    @ViewBuilder
    private var actionSection: some View {
        Section {
            if engine.isRunning {
                VStack(alignment: .leading, spacing: 8) {
                    Text(engine.phase).font(.headline)
                    if let fraction = engine.fraction {
                        ProgressView(value: fraction)
                    } else {
                        ProgressView()
                    }
                    if !engine.detail.isEmpty {
                        Text(engine.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                .padding(.vertical, 4)
                Button(role: .destructive) {
                    engine.cancel()
                } label: {
                    Label("Annulla", systemImage: "xmark.circle")
                }
            } else {
                Button {
                    model.startBackup(trigger: .manual)
                } label: {
                    Label("Esegui backup ora", systemImage: "arrow.up.circle.fill")
                        .font(.headline)
                }
                .disabled(!model.settings.isConfigured)
            }
        } footer: {
            if engine.isRunning {
                Text("Lascia l'app aperta: lo schermo resta acceso finché il backup non finisce.")
            }
        }
    }
}

private struct CategoryRow: View {
    @EnvironmentObject private var engine: BackupEngine
    let category: BackupCategory

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(category.title)
                if let failure = engine.lastFailure(category) {
                    Text(failure).font(.caption).foregroundStyle(.red).lineLimit(2)
                } else if let date = engine.lastRun(category) {
                    Text("Ultimo backup: \(date.friendly)").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("Mai eseguito").font(.caption).foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: category.icon)
        }
    }
}
