import SwiftUI

struct LogView: View {
    @EnvironmentObject private var log: AppLog

    var body: some View {
        List {
            if log.entries.isEmpty {
                Text("Nessuna operazione registrata.").foregroundStyle(.secondary)
            }
            ForEach(log.entries.reversed()) { entry in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: icon(for: entry.level))
                        .foregroundStyle(color(for: entry.level))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.message).font(.callout).textSelection(.enabled)
                        Text(entry.date.friendly).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Registro")
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                ShareLink(item: log.asText) {
                    Image(systemName: "square.and.arrow.up")
                }
                Button(role: .destructive) {
                    log.clear()
                } label: {
                    Image(systemName: "trash")
                }
            }
        }
    }

    private func icon(for level: LogEntry.Level) -> String {
        switch level {
        case .info: return "info.circle"
        case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.triangle"
        case .error: return "xmark.octagon"
        }
    }

    private func color(for level: LogEntry.Level) -> Color {
        switch level {
        case .info: return .secondary
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }
}
