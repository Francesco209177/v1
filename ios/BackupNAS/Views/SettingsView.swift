import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var engine: BackupEngine
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledField("Indirizzo", text: $model.settings.host, prompt: "100.101.102.103 o nas.tail1234.ts.net")
                        .keyboardType(.URL)
                    LabeledField("Condivisione", text: $model.settings.share, prompt: "es. backup")
                    LabeledField("Utente", text: $model.settings.username, prompt: "utente del NAS")
                    HStack {
                        Text("Password")
                        SecureField("password", text: $password)
                            .multilineTextAlignment(.trailing)
                            .onChange(of: password) { newValue in
                                model.password = newValue
                            }
                    }
                } header: {
                    Text("NAS (SMB)")
                } footer: {
                    Text("Usa l'indirizzo Tailscale del NAS (lo trovi nell'app Tailscale o nella console): funziona sia in casa sia fuori. La password resta nel Portachiavi dell'iPhone.")
                }

                Section {
                    LabeledField("Cartella base", text: $model.settings.basePath, prompt: "Backup iPhone")
                    LabeledField("Nome iPhone", text: $model.settings.deviceName, prompt: "iPhone")
                    Stepper("Copie da tenere: \(model.settings.keepCopies)", value: $model.settings.keepCopies, in: 1...365)
                } header: {
                    Text("Destinazione")
                } footer: {
                    Text("I file finiscono in \\\\\(SMBService.normalizedHost(model.settings.host))\\\(model.settings.share)\\\(model.settings.deviceRoot.replacingOccurrences(of: "/", with: "\\")). \"Copie da tenere\" vale per contatti, calendari e promemoria.")
                }

                Section {
                    Button {
                        Task { await engine.testConnection() }
                    } label: {
                        HStack {
                            Label("Test connessione", systemImage: "network")
                            if engine.isTesting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!model.settings.isConfigured || engine.isTesting)
                    if let result = engine.testResult {
                        Text(result).font(.callout).textSelection(.enabled)
                    }
                }

                Section {
                    Toggle("Carica subito i file condivisi", isOn: $model.settings.autoUploadShared)
                    Toggle("Backup in background", isOn: $model.settings.backgroundEnabled)
                    if model.settings.backgroundEnabled {
                        Toggle("Solo se in carica", isOn: $model.settings.backgroundRequiresPower)
                    }
                } header: {
                    Text("Automatico")
                } footer: {
                    Text("iOS decide quando eseguire il backup in background (di solito di notte, in carica). Per un orario preciso crea un'automazione in Comandi rapidi con l'azione \"Esegui backup NAS\", per esempio \"Quando l'iPhone è collegato all'alimentazione\".")
                }

                Section {
                    NavigationLink {
                        LogView()
                    } label: {
                        Label("Registro", systemImage: "list.bullet.rectangle")
                    }
                } footer: {
                    Text("Backup NAS \(Bundle.main.appVersion) · le app installate con SideStore e un Apple ID gratuito vanno rinnovate ogni 7 giorni.")
                }
            }
            .navigationTitle("Impostazioni")
            .onAppear { password = model.password }
        }
    }
}

private struct LabeledField: View {
    let title: String
    @Binding var text: String
    let prompt: String

    init(_ title: String, text: Binding<String>, prompt: String) {
        self.title = title
        self._text = text
        self.prompt = prompt
    }

    var body: some View {
        HStack {
            Text(title)
            TextField(prompt, text: $text)
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }
}

extension Bundle {
    var appVersion: String {
        let version = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}
