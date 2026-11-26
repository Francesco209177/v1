import SpriteKit
import UIKit

/// Riepilogo di fine immersione: che cosa si è portato a casa. Se Tecla è svenuta
/// si può tenere un solo oggetto: lo si sceglie qui.
final class DiveResultsPanel: SKNode {
    private struct Entry {
        let title: String
        let detail: String
        let icon: String
        /// Che cosa resta nella sacca se si sceglie questa voce dopo uno svenimento.
        let keepFish: CatchItem?
        let keepMaterial: String?
    }

    /// Chiamata alla conferma, con la sacca che Tecla porta davvero a casa.
    var onDone: ((DiveBag) -> Void)?

    private let bag: DiveBag
    private let fainted: Bool
    private var entries: [Entry] = []
    private var rows: [SKNode] = []
    private var rowBodies: [SKShapeNode] = []
    private var selected: Int = 0
    private let veil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let card: SKShapeNode = SKShapeNode()
    private let title: SKLabelNode
    private let subtitle: SKLabelNode
    private let hint: SKLabelNode
    private let button: PillButton
    private var pressed: Bool = false
    private var finished: Bool = false
    private var moveLatch: Bool = false
    private var rowSize: CGSize = CGSize(width: 200, height: 30)
    private var iconScale: CGFloat = 1

    init(bag: DiveBag, fainted: Bool, deepest: Double, catalog: FishCatalog) {
        self.bag = bag
        self.fainted = fainted
        title = Theme.label(fainted ? String(localized: "Sei svenuta!") : String(localized: "Bottino dell'immersione"),
                            size: 22, weight: UIFont.Weight.heavy, color: Theme.ink)
        let weightText: String = String(format: "%.1f", bag.totalWeight)
        subtitle = Theme.label(String(localized: "Profondità massima \(Int(deepest.rounded())) m · Carico \(weightText) kg"),
                               size: 12, weight: UIFont.Weight.semibold, color: Theme.ink.withAlphaComponent(0.7))
        hint = Theme.label("", size: 12, weight: UIFont.Weight.semibold, color: Theme.terracotta)
        button = PillButton(text: fainted ? String(localized: "Tieni questo") : String(localized: "Continua"),
                            size: CGSize(width: 190, height: 44), fill: Theme.turquoise)
        super.init()

        // Pesci raggruppati per specie e stelle, i più pregiati per primi.
        var groups: [String: (item: CatchItem, count: Int, weight: Double)] = [:]
        for item in bag.fish {
            let key: String = "\(item.speciesId)#\(item.stars)"
            if let existing: (item: CatchItem, count: Int, weight: Double) = groups[key] {
                groups[key] = (item: existing.item, count: existing.count + 1, weight: existing.weight + item.weight)
            } else {
                groups[key] = (item: item, count: 1, weight: item.weight)
            }
        }
        let ordered: [(item: CatchItem, count: Int, weight: Double)] = groups.values.sorted { (a, b) -> Bool in
            let pa: Int = (catalog.find(a.item.speciesId)?.price ?? 0) * a.item.stars
            let pb: Int = (catalog.find(b.item.speciesId)?.price ?? 0) * b.item.stars
            if pa != pb { return pa > pb }
            return a.item.speciesId < b.item.speciesId
        }
        for group in ordered {
            let name: String = catalog.find(group.item.speciesId)?.name.text() ?? group.item.speciesId
            let stars: String = String(repeating: "★", count: group.item.stars)
            let count: String = group.count > 1 ? "  ×\(group.count)" : ""
            entries.append(Entry(title: "\(name)  \(stars)\(count)", detail: String(format: "%.1f kg", group.weight),
                                 icon: "\(group.item.speciesId)_swim_0", keepFish: group.item, keepMaterial: nil))
        }
        for kind in bag.materials.keys.sorted() {
            let count: Int = bag.materials[kind] ?? 0
            if count <= 0 { continue }
            let pickup: PickupPoint.Kind = PickupPoint.Kind(rawValue: kind) ?? PickupPoint.Kind.conchiglia
            let weight: Double = (DiveBag.materialWeights[kind] ?? 0.2) * Double(count)
            entries.append(Entry(title: "\(DiveScene.pickupName(pickup))  ×\(count)", detail: String(format: "%.1f kg", weight),
                                 icon: "pickup_\(kind)", keepFish: nil, keepMaterial: kind))
        }

        veil.alpha = 0.78
        addChild(veil)
        card.fillColor = Theme.lime
        card.strokeColor = SKColor.clear
        card.zPosition = 1
        addChild(card)
        for node in [title, subtitle, hint] {
            node.zPosition = 2
            addChild(node)
        }
        button.zPosition = 2
        addChild(button)

        if entries.isEmpty {
            hint.attributedText = Theme.attributed(String(localized: "Nessun bottino stavolta."), size: 13, color: Theme.ink.withAlphaComponent(0.7))
        } else if fainted {
            hint.attributedText = Theme.attributed(String(localized: "Puoi tenere un solo oggetto: scegli quale. Il resto va perso."), size: 12, color: Theme.terracotta)
        }
        // Al massimo dodici voci, su due colonne.
        let shown: Int = min(entries.count, 12)
        var i: Int = 0
        while i < shown {
            let entry: Entry = entries[i]
            let row: SKNode = SKNode()
            row.zPosition = 2
            let body: SKShapeNode = SKShapeNode()
            body.strokeColor = SKColor.clear
            row.addChild(body)
            let icon: SKSpriteNode = SpriteForge.shared.node(entry.icon)
            icon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            icon.name = "icon"
            icon.zPosition = 1
            row.addChild(icon)
            let name: SKLabelNode = Theme.label(entry.title, size: 13, weight: UIFont.Weight.bold, color: Theme.ink)
            name.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
            name.name = "name"
            name.zPosition = 1
            row.addChild(name)
            let detail: SKLabelNode = Theme.label(entry.detail, size: 12, weight: UIFont.Weight.semibold, color: Theme.ink.withAlphaComponent(0.65))
            detail.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.right
            detail.name = "detail"
            detail.zPosition = 1
            row.addChild(detail)
            addChild(row)
            rows.append(row)
            rowBodies.append(body)
            i += 1
        }
        refreshSelection()
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    func layout(sceneSize: CGSize, safe: CGRect, pixelScale: CGFloat) {
        veil.size = CGSize(width: sceneSize.width + 4, height: sceneSize.height + 4)
        let cardWidth: CGFloat = min(560, safe.width - 24)
        let cardHeight: CGFloat = min(330, safe.height - 12)
        let cx: CGFloat = safe.midX
        let cy: CGFloat = safe.midY
        card.path = CGPath(roundedRect: CGRect(x: cx - cardWidth / 2, y: cy - cardHeight / 2, width: cardWidth, height: cardHeight),
                           cornerWidth: 20, cornerHeight: 20, transform: nil)
        let top: CGFloat = cy + cardHeight / 2
        title.position = CGPoint(x: cx, y: top - 26)
        subtitle.position = CGPoint(x: cx, y: top - 48)
        hint.position = CGPoint(x: cx, y: top - 66)
        button.position = CGPoint(x: cx, y: cy - cardHeight / 2 + 32)

        let columns: Int = rows.count > 6 ? 2 : 1
        let perColumn: Int = columns == 2 ? (rows.count + 1) / 2 : max(rows.count, 1)
        let gap: CGFloat = 8
        let rowWidth: CGFloat = (cardWidth - 36 - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let available: CGFloat = cardHeight - 84 - 62
        let rowHeight: CGFloat = min(30, max(20, available / CGFloat(max(perColumn, 1)) - 4))
        rowSize = CGSize(width: rowWidth, height: rowHeight)
        iconScale = pixelScale
        let startY: CGFloat = top - 84 - rowHeight / 2
        var i: Int = 0
        while i < rows.count {
            let column: Int = i / perColumn
            let line: Int = i % perColumn
            let x: CGFloat = cx - cardWidth / 2 + 18 + rowWidth / 2 + CGFloat(column) * (rowWidth + gap)
            let row: SKNode = rows[i]
            row.position = CGPoint(x: x, y: startY - CGFloat(line) * (rowHeight + 4))
            rowBodies[i].path = CGPath(roundedRect: CGRect(x: -rowWidth / 2, y: -rowHeight / 2, width: rowWidth, height: rowHeight),
                                       cornerWidth: 9, cornerHeight: 9, transform: nil)
            if let icon: SKSpriteNode = row.childNode(withName: "icon") as? SKSpriteNode {
                // L'icona è pixel art: scala intera, ridotta se il pesce è troppo grande per la riga.
                let natural: CGSize = icon.texture?.size() ?? CGSize(width: 16, height: 16)
                var scale: CGFloat = pixelScale
                if natural.height * scale > rowHeight - 2 || natural.width * scale > 54 {
                    scale = min((rowHeight - 2) / max(natural.height, 1), 54 / max(natural.width, 1))
                }
                icon.setScale(scale)
                icon.position = CGPoint(x: -rowWidth / 2 + 32, y: 0)
            }
            row.childNode(withName: "name")?.position = CGPoint(x: -rowWidth / 2 + 64, y: 0)
            row.childNode(withName: "detail")?.position = CGPoint(x: rowWidth / 2 - 10, y: 0)
            i += 1
        }
    }

    private func refreshSelection() {
        var i: Int = 0
        while i < rowBodies.count {
            let chosen: Bool = fainted && i == selected
            rowBodies[i].fillColor = chosen ? Theme.ochre.withAlphaComponent(0.55) : Theme.ink.withAlphaComponent(0.07)
            i += 1
        }
    }

    private func confirm() {
        if finished { return }
        finished = true
        Feedback.tap()
        var kept: DiveBag = bag
        if fainted {
            kept.fish = []
            kept.materials = [:]
            if selected < entries.count && selected < rows.count {
                if let item: CatchItem = entries[selected].keepFish {
                    kept.fish = [item]
                } else if let kind: String = entries[selected].keepMaterial {
                    kept.materials[kind] = 1
                }
            }
        }
        onDone?(kept)
    }

    // MARK: - Comandi

    func handle(input: InputManager) {
        if finished { return }
        if fainted && !rows.isEmpty {
            let y: Double = input.move.y
            if abs(y) < 0.4 {
                moveLatch = false
            } else if !moveLatch {
                moveLatch = true
                selected = (selected + (y < 0 ? 1 : rows.count - 1)) % rows.count
                refreshSelection()
                Feedback.tap()
            }
        }
        if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) {
            confirm()
        }
    }

    func touchBegan(at point: CGPoint) {
        if finished { return }
        if button.contains(point: point) {
            pressed = true
            button.setPressed(true)
            return
        }
        if fainted {
            var i: Int = 0
            while i < rows.count {
                let p: CGPoint = rows[i].position
                if abs(point.x - p.x) <= rowSize.width / 2 && abs(point.y - p.y) <= rowSize.height / 2 + 2 {
                    selected = i
                    refreshSelection()
                    Feedback.tap()
                }
                i += 1
            }
        }
    }

    func touchEnded(at point: CGPoint) {
        if !pressed { return }
        pressed = false
        button.setPressed(false)
        if button.contains(point: point) { confirm() }
    }
}
