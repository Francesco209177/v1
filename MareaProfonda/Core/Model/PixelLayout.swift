import Foundation

/// Calcola la scala intera dei pixel d'arte.
///
/// La scena lavora in punti; il mondo è disegnato in "pixel d'arte". Ogni pixel d'arte
/// deve occupare un numero intero `k` di pixel fisici, altrimenti la pixel art tremola.
/// `k` è scelto perché l'altezza visibile sia vicina a `targetArtHeight`.
struct PixelLayout: Equatable {
    static let targetArtHeight: Double = 240

    let viewWidth: Double
    let viewHeight: Double
    let screenScale: Double
    /// Pixel fisici per pixel d'arte.
    let k: Int

    init(viewWidth: Double, viewHeight: Double, screenScale: Double) {
        let scale: Double = screenScale > 0 ? screenScale : 1
        self.viewWidth = max(viewWidth, 1)
        self.viewHeight = max(viewHeight, 1)
        self.screenScale = scale
        let devicePixels: Double = self.viewHeight * scale
        let ideal: Double = (devicePixels / PixelLayout.targetArtHeight).rounded()
        self.k = max(2, Int(ideal))
    }

    /// Punti dello schermo per pixel d'arte.
    var pointsPerArtPixel: Double { return Double(k) / screenScale }
    /// Scala da dare alla camera perché un'unità del mondo valga un pixel d'arte.
    var cameraScale: Double { return screenScale / Double(k) }
    /// Dimensione dell'area visibile, in pixel d'arte.
    var artWidth: Double { return viewWidth / pointsPerArtPixel }
    var artHeight: Double { return viewHeight / pointsPerArtPixel }

    /// Allinea una coordinata del mondo alla griglia dei pixel fisici.
    func snap(_ v: Double) -> Double {
        let kk: Double = Double(k)
        return (v * kk).rounded() / kk
    }
}
