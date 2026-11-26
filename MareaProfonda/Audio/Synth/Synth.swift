import Foundation

/// Forma d'onda di un oscillatore.
enum Wave: String, Codable {
    case sine
    case triangle
    case square
    case saw
    case noise
}

/// Inviluppo di una nota: attacco, decadimento fino al livello di tenuta, rilascio. Tempi in secondi.
struct Envelope: Equatable {
    var attack: Double
    var decay: Double
    var sustain: Double
    var release: Double

    /// Ampiezza all'istante `t` di una nota tenuta per `held` secondi.
    func level(at t: Double, held: Double) -> Double {
        if t < 0 { return 0 }
        if t < attack { return attack > 0 ? t / attack : 1 }
        var value: Double
        if t < attack + decay {
            value = 1 - (1 - sustain) * (decay > 0 ? (t - attack) / decay : 1)
        } else {
            value = sustain
        }
        if t > held {
            let r: Double = release > 0 ? (t - held) / release : 1
            value *= max(0, 1 - r)
        }
        return value
    }
}

/// Sintesi sonora in codice puro: tutto ciò che si sente nel gioco nasce da qui, senza file audio.
/// I suoni sono resi in anticipo in buffer mono a 22.050 Hz; nulla viene calcolato nel thread audio.
enum Synth {
    static let sampleRate: Double = 22_050

    private static let semitones: [Character: Int] = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11]

    /// Numero MIDI di una nota scritta come "A4", "C#3", "Bb2".
    static func midi(_ name: String) -> Int? {
        var chars: [Character] = Array(name)
        guard let letter: Character = chars.first, let base: Int = semitones[letter] else { return nil }
        chars.removeFirst()
        var shift: Int = 0
        if let accidental: Character = chars.first {
            if accidental == "#" {
                shift = 1
                chars.removeFirst()
            } else if accidental == "b" {
                shift = -1
                chars.removeFirst()
            }
        }
        guard let octave: Int = Int(String(chars)) else { return nil }
        return (octave + 1) * 12 + base + shift
    }

    static func frequency(midi: Int) -> Double {
        return 440 * pow(2, Double(midi - 69) / 12)
    }

    static func frequency(note: String) -> Double? {
        guard let m: Int = midi(note) else { return nil }
        return frequency(midi: m)
    }

    static func samples(_ seconds: Double) -> Int {
        return max(0, Int((seconds * sampleRate).rounded()))
    }

    @inline(__always)
    private static func value(_ wave: Wave, phase: Double, noise: inout UInt32) -> Double {
        let p: Double = phase - phase.rounded(.down)
        switch wave {
        case .sine: return sin(2 * Double.pi * p)
        case .triangle: return p < 0.5 ? 4 * p - 1 : 3 - 4 * p
        case .square: return p < 0.5 ? 0.8 : -0.8
        case .saw: return 2 * p - 1
        case .noise:
            noise = noise &* 1_664_525 &+ 1_013_904_223
            return Double(noise >> 8) / 8_388_608 - 1
        }
    }

    /// Aggiunge una nota a un buffer. Se `wrap` è true la coda che esce dal fondo rientra dall'inizio:
    /// così un brano si ripete senza stacchi.
    /// - Parameters:
    ///   - slide: di quanti semitoni la nota scivola dall'inizio alla fine (0 = ferma).
    ///   - vibrato: profondità del vibrato in semitoni.
    static func add(to buffer: inout [Float], at start: Double, frequency: Double, held: Double, wave: Wave, volume: Double,
                    envelope: Envelope, slide: Double = 0, vibrato: Double = 0, wrap: Bool = false, seed: UInt32 = 1) {
        if buffer.isEmpty || frequency <= 0 { return }
        let total: Int = samples(held + envelope.release)
        let first: Int = samples(start)
        var phase: Double = 0
        var noise: UInt32 = seed &* 2_654_435_761 &+ 12_345
        var i: Int = 0
        while i < total {
            let t: Double = Double(i) / sampleRate
            let progress: Double = total > 1 ? Double(i) / Double(total - 1) : 0
            var f: Double = frequency
            if slide != 0 { f *= pow(2, slide * progress / 12) }
            if vibrato != 0 { f *= pow(2, vibrato * sin(2 * Double.pi * 5.5 * t) / 12) }
            phase += f / sampleRate
            let sample: Double = value(wave, phase: phase, noise: &noise) * envelope.level(at: t, held: held) * volume
            var index: Int = first + i
            if index >= buffer.count {
                if !wrap { break }
                index %= buffer.count
            }
            buffer[index] += Float(sample)
            i += 1
        }
    }

    /// Passa-basso a un polo, applicato sul posto.
    static func lowpass(_ buffer: inout [Float], cutoff: Double) {
        if buffer.isEmpty { return }
        let k: Float = Float(1 - exp(-2 * Double.pi * cutoff / sampleRate))
        var state: Float = 0
        var i: Int = 0
        while i < buffer.count {
            state += (buffer[i] - state) * k
            buffer[i] = state
            i += 1
        }
    }

    /// Porta il picco al livello dato e arrotonda le creste, perché nulla esca mai da ±1.
    static func finish(_ buffer: inout [Float], peak: Double) {
        var top: Float = 0
        for s in buffer { top = max(top, abs(s)) }
        if top < 1e-6 { return }
        let gain: Float = Float(peak) / top
        var i: Int = 0
        while i < buffer.count {
            let v: Float = buffer[i] * gain
            buffer[i] = max(-1, min(1, v))
            i += 1
        }
    }
}

// MARK: - Effetti

enum SFXKind: String, CaseIterable {
    case tap
    case hit
    case thud
    case success
    case warning
    case harpoon
    case catchFish
    case bubble
    case pickup
    case coin
    case hurt
    case roar
    case blast
    case clang
    case letter
    case kick
    case snare
    case hat
    case bell
    case pour
}

enum SFX {
    private static let pluck: Envelope = Envelope(attack: 0.002, decay: 0.08, sustain: 0.0, release: 0.02)

    /// Rende un effetto in un buffer mono. Sono tutti brevi: meno di un secondo e mezzo.
    static func render(_ kind: SFXKind) -> [Float] {
        func make(_ seconds: Double) -> [Float] { return [Float](repeating: 0, count: Synth.samples(seconds)) }
        var b: [Float]
        switch kind {
        case .tap:
            b = make(0.06)
            Synth.add(to: &b, at: 0, frequency: 880, held: 0.02, wave: Wave.triangle, volume: 0.6, envelope: pluck)
        case .hit:
            b = make(0.16)
            Synth.add(to: &b, at: 0, frequency: 220, held: 0.05, wave: Wave.square, volume: 0.5, envelope: Envelope(attack: 0.001, decay: 0.06, sustain: 0, release: 0.04), slide: -12)
            Synth.add(to: &b, at: 0, frequency: 900, held: 0.03, wave: Wave.noise, volume: 0.5, envelope: pluck, seed: 3)
        case .thud:
            b = make(0.32)
            Synth.add(to: &b, at: 0, frequency: 110, held: 0.12, wave: Wave.sine, volume: 0.9, envelope: Envelope(attack: 0.002, decay: 0.14, sustain: 0, release: 0.1), slide: -14)
            Synth.add(to: &b, at: 0, frequency: 300, held: 0.05, wave: Wave.noise, volume: 0.35, envelope: pluck, seed: 5)
            Synth.lowpass(&b, cutoff: 1800)
        case .success:
            b = make(0.55)
            for (i, note) in ["E5", "G5", "C6"].enumerated() {
                Synth.add(to: &b, at: Double(i) * 0.09, frequency: Synth.frequency(note: note) ?? 660, held: 0.10, wave: Wave.triangle, volume: 0.5,
                          envelope: Envelope(attack: 0.004, decay: 0.12, sustain: 0.3, release: 0.16))
            }
        case .warning:
            b = make(0.42)
            for i in 0..<2 {
                Synth.add(to: &b, at: Double(i) * 0.18, frequency: i == 0 ? 520 : 390, held: 0.12, wave: Wave.square, volume: 0.4,
                          envelope: Envelope(attack: 0.004, decay: 0.05, sustain: 0.6, release: 0.05))
            }
        case .harpoon:
            b = make(0.22)
            Synth.add(to: &b, at: 0, frequency: 1400, held: 0.10, wave: Wave.noise, volume: 0.5, envelope: Envelope(attack: 0.001, decay: 0.10, sustain: 0, release: 0.06), seed: 7)
            Synth.add(to: &b, at: 0, frequency: 700, held: 0.08, wave: Wave.saw, volume: 0.3, envelope: Envelope(attack: 0.001, decay: 0.09, sustain: 0, release: 0.04), slide: -18)
            Synth.lowpass(&b, cutoff: 5200)
        case .catchFish:
            b = make(0.5)
            for (i, note) in ["C5", "E5", "G5", "E6"].enumerated() {
                Synth.add(to: &b, at: Double(i) * 0.06, frequency: Synth.frequency(note: note) ?? 520, held: 0.06, wave: Wave.sine, volume: 0.5,
                          envelope: Envelope(attack: 0.003, decay: 0.08, sustain: 0.2, release: 0.14))
            }
        case .bubble:
            b = make(0.14)
            Synth.add(to: &b, at: 0, frequency: 420, held: 0.06, wave: Wave.sine, volume: 0.5, envelope: Envelope(attack: 0.004, decay: 0.07, sustain: 0, release: 0.04), slide: 16)
        case .pickup:
            b = make(0.2)
            Synth.add(to: &b, at: 0, frequency: 660, held: 0.04, wave: Wave.triangle, volume: 0.5, envelope: pluck)
            Synth.add(to: &b, at: 0.05, frequency: 990, held: 0.05, wave: Wave.triangle, volume: 0.5, envelope: Envelope(attack: 0.002, decay: 0.08, sustain: 0, release: 0.06))
        case .coin:
            b = make(0.36)
            Synth.add(to: &b, at: 0, frequency: 1318, held: 0.05, wave: Wave.square, volume: 0.3, envelope: pluck)
            Synth.add(to: &b, at: 0.06, frequency: 1760, held: 0.10, wave: Wave.square, volume: 0.3, envelope: Envelope(attack: 0.002, decay: 0.16, sustain: 0, release: 0.1))
        case .hurt:
            b = make(0.34)
            Synth.add(to: &b, at: 0, frequency: 300, held: 0.16, wave: Wave.saw, volume: 0.5, envelope: Envelope(attack: 0.002, decay: 0.18, sustain: 0, release: 0.08), slide: -10)
            Synth.add(to: &b, at: 0, frequency: 500, held: 0.06, wave: Wave.noise, volume: 0.3, envelope: pluck, seed: 9)
            Synth.lowpass(&b, cutoff: 2400)
        case .roar:
            b = make(1.1)
            Synth.add(to: &b, at: 0, frequency: 70, held: 0.7, wave: Wave.saw, volume: 0.6, envelope: Envelope(attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.3), slide: -7, vibrato: 0.6)
            Synth.add(to: &b, at: 0, frequency: 200, held: 0.6, wave: Wave.noise, volume: 0.3, envelope: Envelope(attack: 0.08, decay: 0.3, sustain: 0.4, release: 0.3), seed: 11)
            Synth.lowpass(&b, cutoff: 900)
        case .blast:
            b = make(0.8)
            Synth.add(to: &b, at: 0, frequency: 400, held: 0.3, wave: Wave.noise, volume: 0.9, envelope: Envelope(attack: 0.001, decay: 0.4, sustain: 0, release: 0.3), seed: 13)
            Synth.add(to: &b, at: 0, frequency: 80, held: 0.25, wave: Wave.sine, volume: 0.8, envelope: Envelope(attack: 0.001, decay: 0.3, sustain: 0, release: 0.2), slide: -16)
            Synth.lowpass(&b, cutoff: 1500)
        case .clang:
            b = make(0.4)
            for f in [1250.0, 1870.0, 2930.0] {
                Synth.add(to: &b, at: 0, frequency: f, held: 0.03, wave: Wave.sine, volume: 0.3, envelope: Envelope(attack: 0.001, decay: 0.2, sustain: 0, release: 0.15))
            }
        case .letter:
            b = make(0.03)
            Synth.add(to: &b, at: 0, frequency: 1500, held: 0.008, wave: Wave.triangle, volume: 0.25, envelope: Envelope(attack: 0.001, decay: 0.012, sustain: 0, release: 0.008))
        case .kick:
            b = make(0.22)
            Synth.add(to: &b, at: 0, frequency: 150, held: 0.08, wave: Wave.sine, volume: 0.9, envelope: Envelope(attack: 0.001, decay: 0.12, sustain: 0, release: 0.08), slide: -20)
        case .snare:
            b = make(0.2)
            Synth.add(to: &b, at: 0, frequency: 1800, held: 0.06, wave: Wave.noise, volume: 0.6, envelope: Envelope(attack: 0.001, decay: 0.10, sustain: 0, release: 0.06), seed: 17)
            Synth.add(to: &b, at: 0, frequency: 190, held: 0.04, wave: Wave.triangle, volume: 0.4, envelope: pluck)
        case .hat:
            b = make(0.07)
            Synth.add(to: &b, at: 0, frequency: 6000, held: 0.015, wave: Wave.noise, volume: 0.3, envelope: Envelope(attack: 0.001, decay: 0.03, sustain: 0, release: 0.02), seed: 19)
        case .bell:
            b = make(1.3)
            for (f, v) in [(523.0, 0.5), (1046.0, 0.25), (1569.0, 0.18), (2217.0, 0.1)] {
                Synth.add(to: &b, at: 0, frequency: f, held: 0.05, wave: Wave.sine, volume: v, envelope: Envelope(attack: 0.002, decay: 0.9, sustain: 0, release: 0.3))
            }
        case .pour:
            b = make(0.3)
            Synth.add(to: &b, at: 0, frequency: 900, held: 0.2, wave: Wave.noise, volume: 0.3, envelope: Envelope(attack: 0.03, decay: 0.1, sustain: 0.6, release: 0.08), seed: 23)
            Synth.lowpass(&b, cutoff: 1300)
        }
        Synth.finish(&b, peak: 0.85)
        return b
    }
}

// MARK: - Musica

/// Una voce di un brano. `voice` sceglie timbro e inviluppo: pluck (pizzicato), pad (tappeto), bass, lead, drums.
/// Ogni battuta è una riga di passi separati da spazi: una nota ("A4", "C#5"), "." per la pausa,
/// "-" per tenere la nota precedente; per la batteria k (cassa), s (rullante), h (charleston).
struct Track: Codable, Equatable {
    let voice: String
    let volume: Double
    let bars: [String]

    static let voices: Set<String> = ["pluck", "pad", "bass", "lead", "bell", "drums"]
}

struct Song: Codable, Equatable {
    let id: String
    /// Battiti al minuto.
    let bpm: Double
    let beatsPerBar: Int
    let stepsPerBeat: Int
    let tracks: [Track]

    var stepsPerBar: Int { return beatsPerBar * stepsPerBeat }
    var stepSeconds: Double { return 60 / bpm / Double(stepsPerBeat) }
    /// Le voci più corte si ripetono fino alla lunghezza della più lunga.
    var bars: Int {
        var n: Int = 1
        for track in tracks { n = max(n, track.bars.count) }
        return n
    }
    var duration: Double { return Double(bars * stepsPerBar) * stepSeconds }
}

struct SongBook: Codable, Equatable {
    let songs: [Song]

    func find(_ id: String) -> Song? {
        return songs.first(where: { $0.id == id })
    }

    func problems() -> [String] {
        var out: [String] = []
        var ids: Set<String> = []
        for song in songs {
            if ids.contains(song.id) { out.append("brano duplicato: \(song.id)") }
            ids.insert(song.id)
            if song.bpm < 30 || song.bpm > 240 || song.beatsPerBar < 1 || song.stepsPerBeat < 1 { out.append("\(song.id): tempo non valido") }
            if song.tracks.isEmpty { out.append("\(song.id): nessuna voce") }
            for (t, track) in song.tracks.enumerated() {
                if !Track.voices.contains(track.voice) { out.append("\(song.id) voce \(t + 1): timbro sconosciuto '\(track.voice)'") }
                if track.bars.isEmpty { out.append("\(song.id) voce \(t + 1): nessuna battuta") }
                for (b, bar) in track.bars.enumerated() {
                    let tokens: [Substring] = bar.split(separator: " ")
                    if tokens.count != song.stepsPerBar {
                        out.append("\(song.id) voce \(t + 1) battuta \(b + 1): \(tokens.count) passi invece di \(song.stepsPerBar)")
                    }
                    for token in tokens {
                        let text: String = String(token)
                        if text == "." || text == "-" { continue }
                        if track.voice == "drums" {
                            if text != "k" && text != "s" && text != "h" { out.append("\(song.id) voce \(t + 1) battuta \(b + 1): colpo sconosciuto '\(text)'") }
                        } else if Synth.midi(text) == nil {
                            out.append("\(song.id) voce \(t + 1) battuta \(b + 1): nota sconosciuta '\(text)'")
                        }
                    }
                }
            }
        }
        return out
    }
}

enum MusicRenderer {
    private static func timbre(_ voice: String) -> (wave: Wave, envelope: Envelope, cutoff: Double) {
        switch voice {
        case "pad": return (wave: Wave.triangle, envelope: Envelope(attack: 0.18, decay: 0.3, sustain: 0.75, release: 0.5), cutoff: 1400)
        case "bass": return (wave: Wave.triangle, envelope: Envelope(attack: 0.008, decay: 0.12, sustain: 0.6, release: 0.08), cutoff: 700)
        case "lead": return (wave: Wave.square, envelope: Envelope(attack: 0.008, decay: 0.10, sustain: 0.5, release: 0.10), cutoff: 2600)
        case "bell": return (wave: Wave.sine, envelope: Envelope(attack: 0.002, decay: 0.5, sustain: 0.0, release: 0.4), cutoff: 6000)
        default: return (wave: Wave.saw, envelope: Envelope(attack: 0.003, decay: 0.16, sustain: 0.12, release: 0.12), cutoff: 2200)
        }
    }

    /// Rende l'intero brano in un buffer mono che si può ripetere senza stacchi.
    static func render(_ song: Song) -> [Float] {
        let total: Int = Synth.samples(song.duration)
        var mix: [Float] = [Float](repeating: 0, count: total)
        if total == 0 { return mix }
        let step: Double = song.stepSeconds
        for track in song.tracks where !track.bars.isEmpty {
            var layer: [Float] = [Float](repeating: 0, count: total)
            let sound: (wave: Wave, envelope: Envelope, cutoff: Double) = timbre(track.voice)
            var bar: Int = 0
            while bar < song.bars {
                let tokens: [String] = track.bars[bar % track.bars.count].split(separator: " ").map { String($0) }
                var s: Int = 0
                while s < tokens.count && s < song.stepsPerBar {
                    let token: String = tokens[s]
                    let start: Double = Double(bar * song.stepsPerBar + s) * step
                    if track.voice == "drums" {
                        if token == "k" {
                            Synth.add(to: &layer, at: start, frequency: 140, held: 0.07, wave: Wave.sine, volume: 1.0,
                                      envelope: Envelope(attack: 0.001, decay: 0.11, sustain: 0, release: 0.07), slide: -20, wrap: true)
                        } else if token == "s" {
                            Synth.add(to: &layer, at: start, frequency: 1800, held: 0.05, wave: Wave.noise, volume: 0.55,
                                      envelope: Envelope(attack: 0.001, decay: 0.09, sustain: 0, release: 0.05), wrap: true, seed: UInt32(bar * 31 + s))
                        } else if token == "h" {
                            Synth.add(to: &layer, at: start, frequency: 6000, held: 0.012, wave: Wave.noise, volume: 0.28,
                                      envelope: Envelope(attack: 0.001, decay: 0.03, sustain: 0, release: 0.02), wrap: true, seed: UInt32(bar * 17 + s + 5))
                        }
                    } else if let midi: Int = Synth.midi(token) {
                        // La nota dura finché i passi successivi sono trattini.
                        var length: Int = 1
                        while s + length < tokens.count && tokens[s + length] == "-" { length += 1 }
                        Synth.add(to: &layer, at: start, frequency: Synth.frequency(midi: midi), held: Double(length) * step * 0.92, wave: sound.wave,
                                  volume: 1.0, envelope: sound.envelope, vibrato: track.voice == "lead" ? 0.12 : 0, wrap: true)
                    }
                    s += 1
                }
                bar += 1
            }
            if track.voice != "drums" { Synth.lowpass(&layer, cutoff: sound.cutoff) }
            var i: Int = 0
            let gain: Float = Float(track.volume)
            while i < total {
                mix[i] += layer[i] * gain
                i += 1
            }
        }
        Synth.finish(&mix, peak: 0.8)
        return mix
    }
}
