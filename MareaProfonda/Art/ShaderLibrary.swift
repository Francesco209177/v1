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

    /// Caustiche sul fondale: applicato ai blocchi di roccia delle zone luminose.
    /// `a_origin` è l'angolo in alto a sinistra del blocco in pixel di mappa, così il disegno
    /// continua senza giunture da un blocco all'altro; `a_fade` lo attenua con la profondità.
    static let terrainCaustics: SKShader = {
        let source: String = """
        void main() {
            vec4 tex = texture2D(u_texture, v_tex_coord);
            vec2 pix = floor(vec2(v_tex_coord.x, 1.0 - v_tex_coord.y) * u_chunk);
            vec2 p = (a_origin + pix) * 0.075;
            float t = u_time * 0.5;
            // Rete di fili di luce: brillano dove una delle due onde passa per lo zero.
            float a = abs(sin(p.x * 1.3 + sin(p.y * 1.7 + t) * 1.2 + t * 0.6));
            float b = abs(sin(p.y * 1.5 + sin(p.x * 1.9 - t * 0.8) * 1.2 - t * 0.5));
            float c = pow(1.0 - min(a, b), 7.0);
            vec3 lit = tex.rgb + vec3(0.34, 0.38, 0.26) * c * a_fade * tex.a;
            gl_FragColor = vec4(min(lit, vec3(tex.a)), tex.a);
        }
        """
        let shader: SKShader = SKShader(source: source)
        shader.uniforms = [SKUniform(name: "u_chunk", float: 256.0)]
        shader.attributes = [
            SKAttribute(name: "a_origin", type: SKAttributeType.vectorFloat2),
            SKAttribute(name: "a_fade", type: SKAttributeType.float)
        ]
        return shader
    }()

    /// Buio degli abissi: un velo scuro a tutto schermo con un alone attorno a Tecla e il
    /// fascio della torcia nella direzione in cui guarda. La luce cala a gradini netti.
    static let darkness: SKShader = {
        let source: String = """
        void main() {
            vec2 d = (v_tex_coord - u_center) * vec2(u_aspect, 1.0);
            float dist = length(d);
            float glow = 1.0 - smoothstep(u_radius * 0.30, u_radius, dist);
            float along = dot(d, u_dir);
            float side = abs(d.x * u_dir.y - d.y * u_dir.x);
            float reach = 1.0 - smoothstep(u_beam * 0.45, u_beam, along);
            float cone = 1.0 - smoothstep(0.02 + along * 0.30, 0.05 + along * 0.44, side);
            float beam = step(0.0, along) * reach * cone * u_torch;
            float light = clamp(max(glow, beam), 0.0, 1.0);
            light = floor(light * 6.0 + 0.5) / 6.0;
            float a = u_dark * (1.0 - light);
            gl_FragColor = vec4(vec3(0.0, 0.012, 0.045) * a, a);
        }
        """
        let shader: SKShader = SKShader(source: source)
        shader.uniforms = [
            SKUniform(name: "u_dark", float: 0.0),
            SKUniform(name: "u_center", vectorFloat2: vector_float2(0.5, 0.5)),
            SKUniform(name: "u_dir", vectorFloat2: vector_float2(1.0, 0.0)),
            SKUniform(name: "u_aspect", float: 2.0),
            SKUniform(name: "u_radius", float: 0.22),
            SKUniform(name: "u_beam", float: 0.75),
            SKUniform(name: "u_torch", float: 1.0)
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

    static func setVector(_ shader: SKShader, _ name: String, _ x: Double, _ y: Double) {
        shader.uniformNamed(name)?.vectorFloat2Value = vector_float2(Float(x), Float(y))
    }

    static func setFloat(_ shader: SKShader, _ name: String, _ value: Double) {
        shader.uniformNamed(name)?.floatValue = Float(value)
    }
}
