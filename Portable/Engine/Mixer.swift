/// Lucchetto minimo su pthread: protegge lo stato condiviso tra il gioco e il thread dell'audio.
final class Lock {
    private let mutex: UnsafeMutablePointer<pthread_mutex_t>

    init() {
        mutex = UnsafeMutablePointer<pthread_mutex_t>.allocate(capacity: 1)
        mutex.initialize(to: pthread_mutex_t())
        pthread_mutex_init(mutex, nil)
    }

    deinit {
        pthread_mutex_destroy(mutex)
        mutex.deallocate()
    }

    @inline(__always)
    func with<T>(_ body: () -> T) -> T {
        pthread_mutex_lock(mutex)
        defer { pthread_mutex_unlock(mutex) }
        return body()
    }
}

/// Lavori lenti (rendere un brano) fuori dal ciclo di gioco.
enum Worker {
    static func run(_ job: @escaping () -> Void) {
        Task.detached(priority: TaskPriority.utility) {
            job()
        }
    }
}

/// Regia audio della versione portabile: mescola musica ed effetti in un flusso mono a 22.050 Hz
/// che il guscio Android legge a blocchi. Stesse chiamate dell'`AudioDirector` dell'app iOS.
final class Mixer {
    static let shared: Mixer = Mixer()

    private struct Voice {
        var samples: [Float]
        var position: Int
        var gain: Float
    }

    private let lock: Lock = Lock()
    private var voices: [Voice] = []
    private var effects: [SFXKind: [Float]] = [:]
    private var songBuffers: [String: [Float]] = [:]
    private var rendering: Set<String> = []
    private var songs: SongBook = SongBook(songs: [])

    private var music: [Float] = []
    private var musicPosition: Int = 0
    private var musicGain: Float = 0
    private var musicTarget: Float = 0
    private var nextMusic: [Float]? = nil
    private var currentSong: String?
    private var wantedSong: String?

    private var musicVolume: Float = 0.56
    private var effectsVolume: Float = 0.9
    private var muffle: Float = 0
    private var muffleTarget: Float = 0
    private var filterState: Float = 0
    private var lastPlayed: [SFXKind: Double] = [:]
    private var clock: Double = 0
    private(set) var status: String = "non avviato"
    /// Campioni consegnati al guscio dall'avvio: la prova automatica verifica che l'audio scorra.
    private(set) var delivered: Int = 0

    private init() {}

    /// Legge i brani e prepara gli effetti in secondo piano.
    func start(dataDirectory: String) {
        if let data: Data = FileManager.default.contents(atPath: dataDirectory + "/music.json"),
           let book: SongBook = try? JSONDecoder().decode(SongBook.self, from: data) {
            songs = book
            status = "attivo"
        } else {
            status = "music.json non leggibile"
        }
        Worker.run { [weak self] in
            var made: [SFXKind: [Float]] = [:]
            for kind in SFXKind.allCases { made[kind] = SFX.render(kind) }
            guard let self: Mixer = self else { return }
            self.lock.with { self.effects = made }
        }
    }

    func setVolumes(music: Double, effects: Double) {
        lock.with {
            musicVolume = Float(MathUtil.clamp(music, 0, 1)) * 0.8
            effectsVolume = Float(MathUtil.clamp(effects, 0, 1))
        }
    }

    /// Quanto il suono è ovattato dall'acqua: 0 = all'aria, 1 = in profondità.
    func setUnderwater(_ amount: Double, immediately: Bool = false) {
        lock.with {
            muffleTarget = Float(MathUtil.clamp(amount, 0, 1))
            if immediately { muffle = muffleTarget }
        }
    }

    /// Avanza l'orologio interno: serve a non ripetere lo stesso effetto troppo in fretta.
    func tick(_ dt: Double) {
        clock += dt
    }

    func play(_ kind: SFXKind, volume: Double = 1) {
        if let last: Double = lastPlayed[kind], clock - last < 0.045 { return }
        lastPlayed[kind] = clock
        lock.with {
            guard let samples: [Float] = effects[kind], !samples.isEmpty else { return }
            if voices.count >= 10 { voices.removeFirst() }
            voices.append(Voice(samples: samples, position: 0, gain: Float(volume)))
        }
    }

    /// Cambia brano (nil = silenzio). La prima volta il brano viene reso in secondo piano.
    func music(_ id: String?) {
        wantedSong = id
        if id == currentSong { return }
        guard let id: String = id else {
            currentSong = nil
            lock.with {
                musicTarget = 0
                nextMusic = []
            }
            return
        }
        let ready: [Float]? = lock.with { songBuffers[id] }
        if let ready: [Float] = ready {
            begin(id, samples: ready)
            return
        }
        guard let song: Song = songs.find(id), !rendering.contains(id) else { return }
        rendering.insert(id)
        Worker.run { [weak self] in
            let samples: [Float] = MusicRenderer.render(song)
            guard let self: Mixer = self else { return }
            self.lock.with {
                self.songBuffers[id] = samples
                self.finished.append(id)
            }
        }
    }

    private var finished: [String] = []

    /// Da chiamare a ogni fotogramma: avvia i brani appena pronti, se sono ancora quelli voluti.
    func update() {
        let done: [String] = lock.with { () -> [String] in
            let out: [String] = finished
            finished.removeAll()
            return out
        }
        for id in done {
            rendering.remove(id)
            if wantedSong == id && currentSong != id {
                let samples: [Float]? = lock.with { songBuffers[id] }
                if let samples: [Float] = samples { begin(id, samples: samples) }
            }
        }
    }

    private func begin(_ id: String, samples: [Float]) {
        currentSong = id
        lock.with {
            // Il brano in corso sfuma, poi parte quello nuovo.
            nextMusic = samples
            musicTarget = 0
        }
    }

    /// Riempie `out` con `frames` campioni a 16 bit. Chiamata dal thread audio del guscio.
    func render(into out: UnsafeMutablePointer<Int16>, frames: Int) {
        lock.with {
            delivered += frames
            let fadeStep: Float = 1.0 / (0.25 * Float(Synth.sampleRate))
            var i: Int = 0
            while i < frames {
                var sample: Float = 0
                // Musica, con dissolvenza al cambio di brano.
                if musicGain < musicTarget {
                    musicGain = min(musicTarget, musicGain + fadeStep)
                } else if musicGain > musicTarget {
                    musicGain = max(musicTarget, musicGain - fadeStep)
                }
                if musicGain <= 0, let next: [Float] = nextMusic {
                    music = next
                    musicPosition = 0
                    nextMusic = nil
                    musicTarget = next.isEmpty ? 0 : 1
                }
                if !music.isEmpty && musicGain > 0 {
                    sample += music[musicPosition] * musicGain * musicVolume
                    musicPosition += 1
                    if musicPosition >= music.count { musicPosition = 0 }
                }
                // Effetti.
                var v: Int = 0
                while v < voices.count {
                    if voices[v].position < voices[v].samples.count {
                        sample += voices[v].samples[voices[v].position] * voices[v].gain * effectsVolume
                        voices[v].position += 1
                    }
                    v += 1
                }
                // Filtro passa-basso a un polo: sott'acqua le alte frequenze si spengono.
                muffle += (muffleTarget - muffle) * 0.0004
                let cutoff: Float = 0.95 - muffle * 0.68
                filterState += (sample - filterState) * cutoff
                let shaped: Float = max(-1, min(1, filterState))
                out[i] = Int16(shaped * 32_000)
                i += 1
            }
            voices.removeAll(where: { $0.position >= $0.samples.count })
        }
    }

    /// Ferma tutti i suoni in corso (app in secondo piano).
    func silence() {
        lock.with { voices.removeAll() }
    }
}
