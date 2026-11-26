// Segnaposto durante il porting.
final class BossPaint {
    init(boss: BossBody, arena: Arena) {}
    func update(boss: BossBody, hazards: [Hazard], dt: Double) {}
    func flashHit() {}
    func draw(_ g: Canvas, boss: BossBody?, hazards: [Hazard], arena: Arena?, camX: Double, camY: Double, time: Double) {}
    func drawGlow(_ g: Canvas, boss: BossBody?, hazards: [Hazard], arena: Arena?, camX: Double, camY: Double, time: Double) {}
    func lights(boss: BossBody?, hazards: [Hazard], camX: Double, camY: Double, width: Int, height: Int) -> [Canvas.Light] { return [] }
}
func drawBossBar(_ g: Canvas, info: BossInfo, ratio: Double, vulnerable: Bool, top: Int, centerX: Int, maxWidth: Int) {}
