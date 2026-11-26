import AVFoundation

/// Regia dell'audio: suona gli effetti e la musica sintetizzati da `Synth`, e li ovatta sott'acqua.
/// I buffer sono resi una volta sola fuori dal thread principale; qui si accodano soltanto.
final class AudioDirector {
    static let shared: AudioDirector = AudioDirector()

    private let engine: AVAudioEngine = AVAudioEngine()
    private let musicNode: AVAudioPlayerNode = AVAudioPlayerNode()
    private let submix: AVAudioMixerNode = AVAudioMixerNode()
    private let filter: AVAudioUnitEQ = AVAudioUnitEQ(numberOfBands: 1)
    private var effectNodes: [AVAudioPlayerNode] = []
    private var nextEffect: Int = 0
    private var format: AVAudioFormat?
    private var effectBuffers: [SFXKind: AVAudioPCMBuffer] = [:]
    private var songBuffers: [String: AVAudioPCMBuffer] = [:]
    private var rendering: Set<String> = []
    private var songs: SongBook = SongBook(songs: [])
    private let work: DispatchQueue = DispatchQueue(label: "it.mareaprofonda.audio", qos: DispatchQoS.utility)
    private var available: Bool = false
    private var currentSong: String?
    private var wantedSong: String?
    private var lastPlayed: [SFXKind: TimeInterval] = [:]
    private var muffle: Double = 0
    /// Messaggio per la prova automatica: dice se l'audio è partito.
    private(set) var status: String = "non avviato"

    private init() {}

    // MARK: Avvio

    /// Da chiamare una volta, all'avvio del gioco.
    func start() {
        if available { return }
        let session: AVAudioSession = AVAudioSession.sharedInstance()
        // Categoria "ambient": rispetta l'interruttore del silenzioso e non ferma la musica di altre app.
        try? session.setCategory(AVAudioSession.Category.ambient, options: [])
        try? session.setActive(true)

        // Senza un'uscita valida (capita nei simulatori senza scheda audio) si resta in silenzio, senza errori.
        let output: AVAudioFormat = engine.outputNode.outputFormat(forBus: 0)
        guard output.sampleRate > 0, output.channelCount > 0,
              let mono: AVAudioFormat = AVAudioFormat(standardFormatWithSampleRate: Synth.sampleRate, channels: 1) else {
            status = "nessuna uscita audio"
            return
        }
        format = mono
        engine.attach(musicNode)
        engine.attach(submix)
        engine.attach(filter)
        engine.connect(musicNode, to: submix, format: mono)
        var i: Int = 0
        while i < 6 {
            let node: AVAudioPlayerNode = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: submix, format: mono)
            effectNodes.append(node)
            i += 1
        }
        engine.connect(submix, to: filter, format: mono)
        engine.connect(filter, to: engine.mainMixerNode, format: mono)
        let band: AVAudioUnitEQFilterParameters = filter.bands[0]
        band.filterType = AVAudioUnitEQFilterType.lowPass
        band.frequency = 18_000
        band.bypass = false

        do {
            try engine.start()
        } catch {
            status = "motore non partito: \(error.localizedDescription)"
            return
        }
        available = true
        status = "attivo"
        if let directory: URL = Bundle.main.url(forResource: "Data", withExtension: nil),
           let book: SongBook = try? DataFiles.load(SongBook.self, file: "music.json", in: directory) {
            songs = book
        }
        applyVolumes()

        // Gli effetti sono piccoli: si rendono tutti subito, fuori dal thread principale.
        work.async { [weak self] in
            var made: [SFXKind: [Float]] = [:]
            for kind in SFXKind.allCases { made[kind] = SFX.render(kind) }
            DispatchQueue.main.async {
                guard let self = self else { return }
                for (kind, samples) in made {
                    if let buffer: AVAudioPCMBuffer = self.makeBuffer(samples) { self.effectBuffers[kind] = buffer }
                }
            }
        }
    }

    private func makeBuffer(_ samples: [Float]) -> AVAudioPCMBuffer? {
        guard let format: AVAudioFormat = format, !samples.isEmpty,
              let buffer: AVAudioPCMBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel: UnsafeMutablePointer<Float> = buffer.floatChannelData?[0] else { return nil }
        samples.withUnsafeBufferPointer { (source: UnsafeBufferPointer<Float>) -> Void in
            if let base: UnsafePointer<Float> = source.baseAddress { channel.update(from: base, count: samples.count) }
        }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        return buffer
    }

    /// Dopo una telefonata o un ritorno dal secondo piano il motore può essersi fermato.
    private func ensureRunning() -> Bool {
        if !available { return false }
        if engine.isRunning { return true }
        do {
            try engine.start()
            return true
        } catch {
            return false
        }
    }

    // MARK: Volumi e filtro

    func applyVolumes() {
        if !available { return }
        musicNode.volume = Float(SettingsStore.shared.settings.musicVolume) * 0.8
    }

    /// 0 fuori dall'acqua, 1 sott'acqua: gli acuti si spengono come dietro un vetro.
    /// - Parameter immediately: true al cambio di scena, per non portarsi dietro il filtro dell'immersione.
    func setUnderwater(_ amount: Double, immediately: Bool = false) {
        if !available { return }
        let target: Double = MathUtil.clamp(amount, 0, 1)
        if abs(target - muffle) < 0.01 { return }
        muffle = immediately ? target : muffle + (target - muffle) * 0.12
        filter.bands[0].frequency = Float(18_000 * pow(1_100.0 / 18_000.0, muffle))
    }

    // MARK: Effetti

    func play(_ kind: SFXKind, volume: Double = 1) {
        guard ensureRunning(), let buffer: AVAudioPCMBuffer = effectBuffers[kind] else { return }
        // Lo stesso effetto non si ripete più di una ventina di volte al secondo.
        let now: TimeInterval = ProcessInfo.processInfo.systemUptime
        if let last: TimeInterval = lastPlayed[kind], now - last < 0.045 { return }
        lastPlayed[kind] = now
        let level: Double = SettingsStore.shared.settings.effectsVolume * volume
        if level <= 0.001 { return }
        let node: AVAudioPlayerNode = effectNodes[nextEffect % effectNodes.count]
        nextEffect += 1
        node.volume = Float(level)
        node.scheduleBuffer(buffer, at: nil, options: AVAudioPlayerNodeBufferOptions.interrupts, completionHandler: nil)
        if !node.isPlaying { node.play() }
    }

    // MARK: Musica

    /// Passa a un brano (nil = silenzio). Se è già quello in corso non succede nulla.
    func music(_ id: String?) {
        wantedSong = id
        if !available || id == currentSong { return }
        guard let id: String = id else {
            currentSong = nil
            musicNode.stop()
            return
        }
        if let buffer: AVAudioPCMBuffer = songBuffers[id] {
            startSong(id, buffer: buffer)
            return
        }
        // La prima volta il brano va reso: lo si fa in secondo piano e lo si avvia quando è pronto.
        guard let song: Song = songs.find(id), !rendering.contains(id) else { return }
        rendering.insert(id)
        work.async { [weak self] in
            let samples: [Float] = MusicRenderer.render(song)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.rendering.remove(id)
                guard let buffer: AVAudioPCMBuffer = self.makeBuffer(samples) else { return }
                self.songBuffers[id] = buffer
                if self.wantedSong == id { self.startSong(id, buffer: buffer) }
            }
        }
    }

    private func startSong(_ id: String, buffer: AVAudioPCMBuffer) {
        if !ensureRunning() { return }
        currentSong = id
        applyVolumes()
        musicNode.stop()
        musicNode.scheduleBuffer(buffer, at: nil, options: AVAudioPlayerNodeBufferOptions.loops, completionHandler: nil)
        musicNode.play()
    }

    // MARK: Secondo piano

    func pause() {
        if available { engine.pause() }
    }

    func resume() {
        if !ensureRunning() { return }
        if let id: String = wantedSong, let buffer: AVAudioPCMBuffer = songBuffers[id], !musicNode.isPlaying {
            startSong(id, buffer: buffer)
        }
    }
}
