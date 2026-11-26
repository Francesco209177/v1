extension SmokeRun {
    static func diveStages() -> [Stage] {
        func dive(_ name: String, _ seconds: Double, _ depth: Double, _ auto: Vec2) -> Stage {
            return Stage(name: name, seconds: seconds, begin: { (app: App) -> Void in
                var config: DiveConfig = DiveConfig()
                config.seed = 7
                config.startDepthMeters = depth
                config.autopilot = auto
                config.autoFire = true
                let screen: DiveScreen = DiveScreen(config: config)
                app.go(screen, animated: false)
                SmokeRun.watched = screen
            })
        }
        return [
            dive("mare_superficie", 3, 0, Vec2(0.55, -0.45)),
            dive("mare_posidonia", 8, 24, Vec2(-0.7, -0.15)),
            dive("mare_gorgonie", 8, 72, Vec2(0.7, 0.1)),
            dive("mare_citta", 3, 290, Vec2(0.6, -0.2)),
            dive("mare_fumarole", 3, 440, Vec2(-0.6, -0.3)),
            Stage(name: "mare_notte", seconds: 6, begin: { (app: App) -> Void in
                var config: DiveConfig = DiveConfig()
                config.seed = 7
                config.night = true
                config.sky = BackdropPainter.SkyStyle.night
                config.startDepthMeters = 18
                config.autopilot = Vec2(0.6, -0.2)
                config.autoFire = true
                config.weapon = GameData.shared.upgrades.weapon("rete")
                config.phaseLabel = "Notte"
                let screen: DiveScreen = DiveScreen(config: config)
                app.go(screen, animated: false)
                SmokeRun.watched = screen
            })
        ]
    }

    /// Tutti e sei i boss, con l'attrezzatura di metà gioco.
    static func bossStages() -> [Stage] {
        var stages: [Stage] = []
        for info in GameData.shared.bosses.bosses {
            stages.append(Stage(name: "boss_\(info.id)", seconds: 9, begin: { (app: App) -> Void in
                var config: DiveConfig = DiveConfig()
                config.seed = 7
                config.boss = info
                config.startDepthMeters = info.depth
                config.autopilot = Vec2(0.5, 0)
                config.autoFire = true
                config.harpoonDamage = 30
                config.torchRadius = 0.27
                let screen: DiveScreen = DiveScreen(config: config)
                app.go(screen, animated: false)
                SmokeRun.watched = screen
            }))
        }
        return stages
    }
}
