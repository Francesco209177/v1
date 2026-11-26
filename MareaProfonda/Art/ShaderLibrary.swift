import SpriteKit
import simd

/// Shader del gioco. Ogni effetto ha una sola istanza condivisa con un elenco fisso di uniform:
/// cambiare sorgente o uniform a runtime costringerebbe SpriteKit a ricompilare.
/// Vanno applicati solo a sprite con texture intera (non a ritagli d'atlante), perché
/// `v_tex_coord` copre l'intera texture.
enum ShaderLibrary {

    static func color(_ c: RGBA) -> vector_float4 {
        return vector_float4(Float(c.r) / 255.0, Float(c.g) / 255.0, Float(c.b) / 255.0, Float(c.a) / 255.0)
    }

    /// Colonna d'acqua: sfumatura verticale tra due colori, con una lieve ondulazione.
    static let water: SKShader = {
        let source: String = """
        void main() {
            float t = v_tex_coord.y;
            float s = t * t * (3.0 - 2.0 * t);
            vec3 c = mix(u_bottom.rgb, u_top.rgb, s);
            float wave = sin(v_tex_coord.y * 22.0 + sin(v_tex_coord.x * 6.0 + u_time * 0.30) * 1.6);
            c += wave * 0.010;
            gl_FragColor = vec4(c, 1.0);
        }
        """
        let shader: SKShader = SKShader(source: source)
        shader.uniforms = [
            SKUniform(name: "u_top", vectorFloat4: vector_float4(0.25, 0.78, 0.82, 1.0)),
            SKUniform(name: "u_bottom", vectorFloat4: vector_float4(0.05, 0.25, 0.45, 1.0))
        ]
        return shader
    }()

    /// Raggi di luce dalla superficie (da usare con fusione additiva).
    static let godRays: SKShader = {
        let source: String = """
        void main() {
            vec2 uv = v_tex_coord;
            float x = uv.x * 3.2 + (1.0 - uv.y) * 0.85 + u_offset;
            float a = sin(x * 5.0 + u_time * 0.31) * 0.5 + 0.5;
            float b = sin(x * 11.0 - u_time * 0.19 + 1.7) * 0.5 + 0.5;
            float c = sin(x * 23.0 + u_time * 0.11 + 4.1) * 0.5 + 0.5;
            float rays = a * b * 0.75 + a * c * 0.25;
            rays = rays * rays;
            float fade = smoothstep(0.05, 1.0, uv.y);
            float k = rays * fade * u_strength;
            gl_FragColor = vec4(vec3(1.0, 0.96, 0.80) * k, k);
        }
        """
        let shader: SKShader = SKShader(source: source)
        shader.uniforms = [
            SKUniform(name: "u_strength", float: 0.35),
            SKUniform(name: "u_offset", float: 0.0)
        ]
        return shader
    }()

    /// Shader volutamente sbagliato: la CI lo usa per verificare di saper riconoscere
    /// un errore di compilazione degli shader nei log. Non è mai usato nel gioco.
    static func makeBrokenCanary() -> SKShader {
        return SKShader(source: "void main() { gl_FragColor = vec4(mareaCanaryUndefinedSymbol, 1.0); }")
    }

    static func setColor(_ shader: SKShader, _ name: String, _ value: RGBA) {
        shader.uniformNamed(name)?.vectorFloat4Value = color(value)
    }

    static func setFloat(_ shader: SKShader, _ name: String, _ value: Double) {
        shader.uniformNamed(name)?.floatValue = Float(value)
    }
}
