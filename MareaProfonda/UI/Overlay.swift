import Combine
import SwiftUI
import UIKit

/// Schermate di menu mostrate sopra il gioco.
enum OverlayScreen: Equatable {
    case slots
    case hub
    case menu
    case summary
    case logbook
    case village
}

/// Stato delle schermate di menu, osservato da SwiftUI.
final class OverlayCenter: ObservableObject {
    static let shared: OverlayCenter = OverlayCenter()

    @Published var screen: OverlayScreen? = nil
    /// Cambia a ogni modifica della partita, per ridisegnare le schermate.
    @Published var revision: Int = 0

    private init() {}

    func show(_ next: OverlayScreen?) {
        screen = next
        revision += 1
    }

    func refresh() {
        revision += 1
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Colori dell'interfaccia in SwiftUI (gli stessi di `Theme`).
enum Palette {
    static let ink: Color = Color(hex: 0x0E2238)
    static let lime: Color = Color(hex: 0xF7F1E3)
    static let ochre: Color = Color(hex: 0xF2B84B)
    static let terracotta: Color = Color(hex: 0xD8553B)
    static let turquoise: Color = Color(hex: 0x2BB7B3)
    static let cobalt: Color = Color(hex: 0x1F4E9C)
    static let danger: Color = Color(hex: 0xE5484D)
}

/// Navigazione dei menu col controller: le voci sono in fila, la levetta sposta la selezione,
/// il tasto di conferma attiva la voce, il tasto dello scatto torna indietro.
final class PadFocus: ObservableObject {
    /// Ordine della voce selezionata.
    @Published var index: Int = 0
    @Published var active: Bool = false
    private var actions: [Int: () -> Void] = [:]
    var onBack: (() -> Void)?
    /// true mentre una schermata ascolta i tasti per conto suo (rimappatura).
    var suspended: Bool = false
    private var timer: Timer?
    private var moveLatch: Bool = false
    private var lastHeld: GameButtons = []

    func register(_ order: Int, action: @escaping () -> Void) {
        actions[order] = action
    }

    /// Dimentica le voci con ordine da `order` in su: da chiamare quando cambia il contenuto.
    func clear(from order: Int) {
        for key in actions.keys where key >= order { actions[key] = nil }
        if index >= order { index = 0 }
    }

    func start() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] (_: Timer) -> Void in
            self?.poll()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func move(_ step: Int) {
        let orders: [Int] = actions.keys.sorted()
        if orders.isEmpty { return }
        guard let position: Int = orders.firstIndex(of: index) else {
            index = orders[0]
            return
        }
        index = orders[(position + step + orders.count) % orders.count]
    }

    private func poll() {
        guard let pad: ControllerSupport.Reading = ControllerSupport.shared.poll(mapping: SettingsStore.shared.settings.mapping) else {
            if active { active = false }
            return
        }
        let pressed: GameButtons = pad.held.subtracting(lastHeld)
        lastHeld = pad.held
        if suspended { return }
        let axis: Double = abs(pad.move.y) > abs(pad.move.x) ? -pad.move.y : pad.move.x
        if abs(axis) < 0.45 {
            moveLatch = false
        } else if !moveLatch {
            moveLatch = true
            if !active { active = true }
            move(axis > 0 ? 1 : -1)
        }
        if pressed.contains(GameButtons.interact) || pressed.contains(GameButtons.primary) {
            if !active {
                active = true
            } else {
                actions[index]?()
            }
        }
        if pressed.contains(GameButtons.dash) {
            onBack?()
        }
    }
}

/// Pulsante grande dei menu, raggiungibile anche col controller.
struct MenuButton: View {
    let title: String
    var subtitle: String? = nil
    var fill: Color = Palette.turquoise
    var textColor: Color = Palette.ink
    var enabled: Bool = true
    let order: Int
    @ObservedObject var focus: PadFocus
    let action: () -> Void

    var body: some View {
        let focused: Bool = focus.active && focus.index == order
        return Button(action: {
            if enabled {
                Feedback.tap()
                action()
            }
        }) {
            VStack(spacing: 2) {
                Text(title)
                    .font(.system(.headline, design: .rounded).weight(.bold))
                if let subtitle: String = subtitle {
                    Text(subtitle)
                        .font(.system(.caption, design: .rounded))
                        .opacity(0.75)
                }
            }
            .foregroundColor(textColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(fill.opacity(enabled ? 1 : 0.4)))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white, lineWidth: focused ? 3 : 0))
        }
        .buttonStyle(.plain)
        .onAppear {
            focus.register(order) {
                if enabled { action() }
            }
        }
    }
}

/// Immagine in pixel art presa dalla fucina degli sprite, ingrandita senza sfocature.
struct PixelImage: View {
    let name: String
    var scale: CGFloat = 2

    var body: some View {
        let image: UIImage? = SpriteForge.shared.image(name)
        let size: CGSize = SpriteForge.shared.pixelSize(name)
        return Group {
            if let image: UIImage = image {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: size.width * scale, height: size.height * scale)
            } else {
                Color.clear.frame(width: size.width * scale, height: size.height * scale)
            }
        }
    }
}

/// Riquadro chiaro con gli angoli arrotondati, base di ogni schermata.
struct Card<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Palette.lime))
            .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 6)
    }
}

/// Radice delle schermate di menu.
struct OverlayRootView: View {
    @ObservedObject var center: OverlayCenter

    var body: some View {
        ZStack {
            switch center.screen {
            case .slots:
                SlotPickerView(revision: center.revision)
            case .hub:
                HubPanelView(revision: center.revision)
            case .menu:
                MenuPlannerView()
            case .summary:
                EveningSummaryView()
            case .logbook:
                LogbookView(revision: center.revision)
            case .village:
                VillageView(revision: center.revision)
            case .none:
                EmptyView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
