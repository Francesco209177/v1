import SwiftUI
import UniformTypeIdentifiers

struct InboxView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var inbox: InboxStore
    @EnvironmentObject private var engine: BackupEngine
    @State private var showingPicker = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Salvare una chat WhatsApp").font(.headline)
                        Text("1. In WhatsApp apri la chat e tocca il suo nome in alto.")
                        Text("2. Scorri e tocca **Esporta chat**, poi scegli se allegare i media.")
                        Text("3. Nel menu Condividi scegli **Backup NAS** (se non c'è: \"Altro\").")
                    }
                    .font(.subheadline)
                    .padding(.vertical, 4)
                } footer: {
                    Text("Funziona con qualsiasi file condiviso da altre app (es. Salute → Esporta tutti i dati, Note → PDF). Le chat esportate sono leggibili ma non si possono reimportare in WhatsApp: per un backup ripristinabile usa il backup completo dal NAS (vedi README).")
                }

                if !inbox.items.isEmpty {
                    Section("File") {
                        ForEach(inbox.items) { item in
                            InboxRow(item: item)
                                .swipeActions {
                                    Button(role: .destructive) {
                                        inbox.remove(item)
                                    } label: {
                                        Label("Elimina", systemImage: "trash")
                                    }
                                }
                        }
                    }
                    Section {
                        if !inbox.pendingItems.isEmpty {
                            Button {
                                model.startBackup(trigger: .manual, only: [.inbox])
                            } label: {
                                Label("Carica ora sul NAS", systemImage: "arrow.up.circle")
                            }
                            .disabled(engine.isRunning || !model.settings.isConfigured)
                        }
                        if inbox.items.contains(where: { $0.state == .uploaded }) {
                            Button("Togli dall'elenco i file già caricati") {
                                inbox.clearUploaded()
                            }
                        }
                    }
                }
            }
            .navigationTitle("Ricevuti")
            .toolbar {
                Button {
                    showingPicker = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Aggiungi file")
            }
            .fileImporter(isPresented: $showingPicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                switch result {
                case .success(let urls):
                    for url in urls {
                        model.handleIncomingFile(url)
                    }
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
            .alert("Errore", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }
}

private struct InboxRow: View {
    let item: InboxItem

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.fileName).lineLimit(2)
                switch item.state {
                case .pending:
                    Text("In attesa · \(PathUtils.formatBytes(item.size)) · ricevuto \(item.received.friendly)")
                        .font(.caption).foregroundStyle(.secondary)
                case .uploaded:
                    Text("Sul NAS \(item.uploadedAt?.friendly ?? "")")
                        .font(.caption).foregroundStyle(.green)
                case .failed:
                    Text(item.lastError ?? "Errore").font(.caption).foregroundStyle(.red).lineLimit(3)
                }
            }
        } icon: {
            Image(systemName: icon)
                .foregroundStyle(iconColor)
        }
    }

    private var iconColor: Color {
        switch item.state {
        case .pending: return Color.accentColor
        case .uploaded: return Color.green
        case .failed: return Color.red
        }
    }

    private var icon: String {
        switch item.state {
        case .pending: return item.isWhatsApp ? "bubble.left.and.bubble.right" : "doc"
        case .uploaded: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.circle.fill"
        }
    }
}
