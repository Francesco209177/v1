import SpriteKit

/// Testo composto con il font a pixel della fucina (numeri ed etichette brevi dell'HUD).
/// Il testo viene reso in maiuscolo; i nodi dei glifi sono riusati quando il testo cambia.
final class PixelLabel: SKNode {
    enum Alignment {
        case left
        case center
        case right
    }

    static let glyphHeight: CGFloat = 7

    var text: String {
        didSet { if text != oldValue { rebuild() } }
    }
    var color: SKColor {
        didSet { recolor() }
    }
    var alignment: Alignment {
        didSet { if alignment != oldValue { rebuild() } }
    }
    /// Ombra di un pixel in basso a destra, per leggere il testo su fondi chiari.
    var shadowColor: SKColor? {
        didSet { rebuild() }
    }
    private(set) var textWidth: CGFloat = 0

    private let glyphLayer: SKNode = SKNode()
    private let shadowLayer: SKNode = SKNode()
    private var glyphs: [SKSpriteNode] = []
    private var shadows: [SKSpriteNode] = []

    init(text: String = "", color: SKColor = SKColor.white, alignment: Alignment = Alignment.left) {
        self.text = text
        self.color = color
        self.alignment = alignment
        self.shadowColor = nil
        super.init()
        shadowLayer.zPosition = 0
        glyphLayer.zPosition = 1
        addChild(shadowLayer)
        addChild(glyphLayer)
        rebuild()
    }

    required init?(coder aDecoder: NSCoder) {
        self.text = ""
        self.color = SKColor.white
        self.alignment = Alignment.left
        self.shadowColor = nil
        super.init(coder: aDecoder)
    }

    private func glyphNode(_ index: Int, in pool: inout [SKSpriteNode], layer: SKNode) -> SKSpriteNode {
        if index < pool.count { return pool[index] }
        let node: SKSpriteNode = SKSpriteNode()
        node.anchorPoint = CGPoint(x: 0, y: 0)
        node.colorBlendFactor = 1
        layer.addChild(node)
        pool.append(node)
        return node
    }

    private func rebuild() {
        let forge: SpriteForge = SpriteForge.shared
        var x: CGFloat = 0
        var used: Int = 0
        let wantsShadow: Bool = shadowColor != nil
        for scalar in text.uppercased().unicodeScalars {
            let name: String = "font_\(scalar.value)"
            if !forge.has(name) {
                x += 4
                continue
            }
            let texture: SKTexture = forge.texture(name)
            let size: CGSize = forge.pixelSize(name)
            let node: SKSpriteNode = glyphNode(used, in: &glyphs, layer: glyphLayer)
            node.texture = texture
            node.size = size
            node.position = CGPoint(x: x, y: 0)
            node.color = color
            node.isHidden = false
            if wantsShadow {
                let shadow: SKSpriteNode = glyphNode(used, in: &shadows, layer: shadowLayer)
                shadow.texture = texture
                shadow.size = size
                shadow.position = CGPoint(x: x + 1, y: -1)
                shadow.color = shadowColor ?? SKColor.black
                shadow.isHidden = false
            }
            used += 1
            x += size.width + 1
        }
        var i: Int = used
        while i < glyphs.count {
            glyphs[i].isHidden = true
            i += 1
        }
        i = wantsShadow ? used : 0
        while i < shadows.count {
            shadows[i].isHidden = true
            i += 1
        }
        textWidth = max(0, x - 1)
        let offset: CGFloat
        switch alignment {
        case .left: offset = 0
        case .center: offset = -(textWidth / 2).rounded()
        case .right: offset = -textWidth
        }
        glyphLayer.position = CGPoint(x: offset, y: 0)
        shadowLayer.position = CGPoint(x: offset, y: 0)
    }

    private func recolor() {
        for node in glyphs { node.color = color }
    }
}
