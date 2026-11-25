import SwiftUI
import UniformTypeIdentifiers

struct FoldersView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var folders: FolderStore
    @EnvironmentObject private var engine: BackupEngine
    @State private var showingPicker = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if folders.folders.isEmpty {
                    Section {
                        Text("Nessuna cartella. Tocca + per sceglierne una dall'app File (iCloud Drive, Sul mio iPhone, ecc.).")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        ForEach(folders.folders) { folder in
                            FolderRow(folder: folder)
                                .swipeActions {
                                    Button(role: .destructive) {
                                        folders.remove(folder)
                                    } label: {
                                        Label("Rimuovi", systemImage: "trash")
                                    }
                                    Button {
                                        folders.resetManifest(for: folder)
                                    } label: {
                                        Label("Ricopia tutto", systemImage: "arrow.clockwise")
                                    }
                                    .tint(.orange)
                                }
                        }
                    } footer: {
                        Text("A ogni backup vengono copiati solo i file nuovi o modificati, in \(model.settings.deviceRoot)/File/. Sul NAS non viene mai cancellato nulla. Scorri a sinistra per rimuovere una cartella o ricopiarla da capo.")
                    }
                }
                if !folders.folders.isEmpty, model.settings.isConfigured {
                    Section {
                        Button {
                            model.startBackup(trigger: .manual, only: [.folders])
                        } label: {
                            Label("Sincronizza ora", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .disabled(engine.isRunning)
                    }
                }
            }
            .navigationTitle("Cartelle")
            .toolbar {
                Button {
                    showingPicker = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Aggiungi cartella")
            }
            .fileImporter(isPresented: $showingPicker, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
                switch result {
                case .success(let urls):
                    for url in urls {
                        do {
                            try folders.add(url: url)
                            model.log.info("Aggiunta cartella \"\(url.lastPathComponent)\"")
                        } catch {
                            errorMessage = error.localizedDescription
                        }
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

private struct FolderRow: View {
    let folder: SyncedFolder

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(folder.name)
                if let error = folder.lastError {
                    Text(error).font(.caption).foregroundStyle(.red)
                } else if let date = folder.lastSync {
                    Text("Sincronizzata \(date.friendly) · \(folder.lastFileCount ?? 0) file")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("Non ancora sincronizzata").font(.caption).foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: "folder.fill")
        }
    }
}
