import React, {useLayoutEffect, useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {glowSprite} from '../../lib/canvas';
import {COLORS} from '../../theme';
import {dustPositions, Shot3State, V3} from './shot3-motion';
import {STAGE} from './stage';

/**
 * Scena three.js dello shot 3. Nessuna animazione interna (niente useFrame):
 * ogni trasformazione arriva già calcolata da shot3State(frame) tramite props.
 */

const FLOOR_Y = -1.95;

type SoftBox = {u: number; el: number; hw: number; hh: number; soft: number; color: string; power: number};

/**
 * Softbox dello "studio" (u = azimut 0..1, el = elevazione in rad, hw/hh = semi-ampiezze in frazioni di giro / di π).
 * Valori HDR (power > 1): è questo che dà riflessi netti e brillanti sulla vernice lucida.
 */
const SOFTBOXES: SoftBox[] = [
	{u: 0.66, el: 0.92, hw: 0.055, hh: 0.055, soft: 0.02, color: '#FFF4E8', power: 6}, // key grande in alto
	{u: 0.9, el: 0.5, hw: 0.11, hh: 0.009, soft: 0.004, color: COLORS.white, power: 30}, // strip orizzontale sottile
	{u: 0.5, el: 0.12, hw: 0.008, hh: 0.13, soft: 0.004, color: '#FFE9DA', power: 20}, // strip verticale
	{u: 0.13, el: 0.12, hw: 0.045, hh: 0.16, soft: 0.02, color: COLORS.orangeBright, power: 3.2}, // rim arancione
	{u: 0.39, el: -0.05, hw: 0.035, hh: 0.15, soft: 0.02, color: COLORS.orange, power: 2}, // rim arancione opposto
	{u: 0.98, el: -0.12, hw: 0.09, hh: 0.1, soft: 0.04, color: COLORS.gray, power: 0.25}, // fill tenue
];

const smooth = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Ambiente HDR procedurale (equirettangolare, half-float): softbox bianchi e arancioni su nero. */
const makeStudioEnv = (): THREE.DataTexture => {
	const w = 256;
	const h = 128;
	const data = new Uint16Array(w * h * 4);
	const boxes = SOFTBOXES.map((b) => ({...b, rgb: new THREE.Color(b.color), v: b.el / Math.PI + 0.5}));
	const bounce = new THREE.Color(COLORS.orangeDeep);
	for (let j = 0; j < h; j++) {
		const v = (j + 0.5) / h; // v=1 è lo zenit
		for (let i = 0; i < w; i++) {
			const u = (i + 0.5) / w;
			// base quasi nera + rimbalzo caldo dal pavimento
			const k = 0.12 * smooth(0.5, 0.05, v);
			let r = 0.012 + bounce.r * k;
			let g = 0.01 + bounce.g * k;
			let b = 0.009 + bounce.b * k;
			for (const box of boxes) {
				const du = Math.abs(u - box.u);
				const a = (1 - smooth(box.hw - box.soft, box.hw + box.soft, Math.min(du, 1 - du))) * (1 - smooth(box.hh - box.soft, box.hh + box.soft, Math.abs(v - box.v)));
				if (a <= 0) continue;
				r += box.rgb.r * box.power * a;
				g += box.rgb.g * box.power * a;
				b += box.rgb.b * box.power * a;
			}
			const o = (j * w + i) * 4;
			data[o] = THREE.DataUtils.toHalfFloat(r);
			data[o + 1] = THREE.DataUtils.toHalfFloat(g);
			data[o + 2] = THREE.DataUtils.toHalfFloat(b);
			data[o + 3] = THREE.DataUtils.toHalfFloat(1);
		}
	}
	const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
	tex.mapping = THREE.EquirectangularReflectionMapping;
	tex.colorSpace = THREE.LinearSRGBColorSpace;
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.needsUpdate = true;
	return tex;
};

/** Camera, ambiente e tone mapping: applicati in layout effect, prima del render manuale di Remotion. */
const Rig: React.FC<{camera: Shot3State['camera']; light: Shot3State['light']}> = ({camera, light}) => {
	const {camera: cam, scene, gl} = useThree();
	const env = useMemo(makeStudioEnv, []);
	useLayoutEffect(() => {
		gl.toneMapping = THREE.NeutralToneMapping;
		gl.toneMappingExposure = 1;
		scene.environment = env;
		return () => {
			scene.environment = null;
			env.dispose();
		};
	}, [env, gl, scene]);
	useLayoutEffect(() => {
		cam.position.set(...camera.position);
		cam.lookAt(...camera.target);
		cam.updateMatrixWorld();
		scene.environmentRotation.set(0, light.envRotation, 0);
		scene.environmentIntensity = light.envIntensity;
	});
	return null;
};

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 w = modelMatrix * vec4(position, 1.0);
	vWorld = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uIntensity;
uniform float uDrift;
uniform vec3 uRipR;
uniform vec3 uRipA;
uniform float uHeight;
varying vec3 vWorld;

float gridLine(vec2 p, float px) {
	vec2 fw = fwidth(p);
	vec2 g = abs(fract(p - 0.5) - 0.5) / fw;
	float l = 1.0 - smoothstep(px * 0.5 - 0.5, px * 0.5 + 0.5, min(g.x, g.y));
	// dove le linee diventano più fitte di un pixel la griglia sfuma (niente moiré)
	return l * (1.0 - smoothstep(0.22, 0.6, max(fw.x, fw.y)));
}

void main() {
	vec2 p = vWorld.xz;
	float d = length(p);
	float fade = 1.0 - smoothstep(0.0, 7.5, d);
	fade *= fade;
	// sfuma verso il bordo basso del canvas: nessun taglio netto in primo piano
	float screenFade = smoothstep(0.03, 0.3, gl_FragCoord.y / uHeight);
	float ripple = 0.0;
	for (int i = 0; i < 3; i++) {
		float x = (d - uRipR[i]) / 0.32;
		ripple += exp(-x * x) * uRipA[i];
	}
	vec2 gp = (p + vec2(0.0, uDrift)) / 0.62;
	float line = gridLine(gp, 1.6) + 0.35 * gridLine(gp * 4.0, 1.0) * (1.0 - smoothstep(1.5, 4.0, d));
	float pool = exp(-d * d / 2.6) * 0.3; // alone di luce riflessa sotto l'oggetto
	float a = line * fade * (0.42 + 2.4 * ripple) + pool + ripple * fade * 0.1;
	vec3 col = mix(uColor, uHot, clamp(ripple * 0.9, 0.0, 1.0));
	gl_FragColor = vec4(col, clamp(a * uIntensity * screenFade, 0.0, 1.0));
	#include <colorspace_fragment>
}`;

/** Pavimento: griglia prospettica additiva che sfuma nel buio, con onde sui beat. */
const Floor: React.FC<{floor: Shot3State['floor']}> = ({floor}) => {
	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				vertexShader: FLOOR_VERT,
				fragmentShader: FLOOR_FRAG,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				uniforms: {
					uColor: {value: new THREE.Color(COLORS.orange)},
					uHot: {value: new THREE.Color(COLORS.orangeHot)},
					uIntensity: {value: 1},
					uDrift: {value: 0},
					uRipR: {value: new THREE.Vector3()},
					uRipA: {value: new THREE.Vector3()},
					uHeight: {value: STAGE.h},
				},
			}),
		[],
	);
	useLayoutEffect(() => () => material.dispose(), [material]);
	material.uniforms.uIntensity.value = floor.intensity;
	material.uniforms.uDrift.value = floor.drift;
	(material.uniforms.uRipR.value as THREE.Vector3).set(...floor.rippleRadius);
	(material.uniforms.uRipA.value as THREE.Vector3).set(...floor.rippleAmp);
	return (
		<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} material={material} renderOrder={-1}>
			<planeGeometry args={[18, 18]} />
		</mesh>
	);
};

/** Sprite additivo morbido: alone dei globi luminosi (bloom finto, con occlusione reale via depth test). */
const useGlowTexture = (): THREE.CanvasTexture =>
	useMemo(() => {
		const t = new THREE.CanvasTexture(glowSprite(COLORS.orange, COLORS.orangeHot, 128));
		t.colorSpace = THREE.SRGBColorSpace;
		return t;
	}, []);

const Satellite: React.FC<{sat: Shot3State['satellites'][number]; glowTex: THREE.Texture}> = ({sat, glowTex}) => {
	if (sat.scale <= 0.001) return null;
	if (sat.kind === 'orb') {
		const halo = sat.scale * 15 * (0.8 + 0.2 * sat.glow);
		return (
			<group position={sat.position}>
				<mesh scale={sat.scale}>
					<sphereGeometry args={[1, 20, 14]} />
					<meshBasicMaterial color={'#FFE3D0'} toneMapped={false} />
				</mesh>
				<sprite scale={[halo, halo, 1]}>
					<spriteMaterial map={glowTex} blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={Math.min(1, 0.85 * sat.glow)} toneMapped={false} />
				</sprite>
			</group>
		);
	}
	if (sat.kind === 'cube') {
		return (
			<mesh position={sat.position} rotation={sat.rotation} scale={sat.scale}>
				<boxGeometry args={[1, 1, 1]} />
				<meshStandardMaterial color={COLORS.gray} roughness={0.22} metalness={0.9} />
			</mesh>
		);
	}
	return (
		<mesh position={sat.position} scale={sat.scale}>
			<sphereGeometry args={[1, 40, 28]} />
			<meshStandardMaterial color={COLORS.white} roughness={0.18} metalness={0.15} />
		</mesh>
	);
};

const Dust: React.FC<{dust: Shot3State['dust']; glowTex: THREE.Texture}> = ({dust, glowTex}) => {
	const positions = useMemo(() => dustPositions(70), []);
	return (
		<points rotation={[0, dust.rotation, 0]}>
			<bufferGeometry>
				<bufferAttribute attach="attributes-position" args={[positions, 3]} />
			</bufferGeometry>
			<pointsMaterial map={glowTex} size={0.16} sizeAttenuation transparent opacity={0.55 * dust.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
		</points>
	);
};

export const Shot3Scene: React.FC<{state: Shot3State}> = ({state}) => {
	const glowTex = useGlowTexture();
	const shellGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.6, 1)), []);
	const {hero, rings, shell, satellites, floor, light, dust, camera} = state;
	const rimPos: V3 = [-3.2, 1.4, -3.6];
	return (
		<>
			<Rig camera={camera} light={light} />
			<directionalLight position={light.keyPosition} intensity={light.keyIntensity} color={'#FFF4E8'} />
			<pointLight position={rimPos} intensity={light.rimIntensity} color={COLORS.orangeBright} />
			<pointLight position={[3.4, -1.2, -2.6]} intensity={light.rimIntensity * 0.45} color={COLORS.orange} />

			

			{/* eroe: nodo torico laccato arancione */}
			{hero.scale > 0.001 ? (
				<mesh rotation={hero.rotation} scale={hero.scale}>
					<torusKnotGeometry args={[1.04, 0.32, 240, 32, 2, 3]} />
					<meshPhysicalMaterial
						color={COLORS.orange}
						roughness={0.24}
						metalness={0.12}
						clearcoat={1}
						clearcoatRoughness={0.06}
						emissive={COLORS.orangeDeep}
						emissiveIntensity={0.05}
					/>
				</mesh>
			) : null}

			{/* onda wireframe: si espande e svanisce a ogni beat */}
			{shell.opacity > 0.004 ? (
				<lineSegments geometry={shellGeo} rotation={shell.rotation} scale={shell.scale}>
					<lineBasicMaterial color={COLORS.orangeHot} transparent opacity={shell.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
				</lineSegments>
			) : null}

			{/* anelli giroscopici */}
			{rings.map((r, i) =>
				r.scale > 0.001 ? (
					<mesh key={i} rotation={r.rotation} scale={r.scale}>
						<torusGeometry args={[i === 0 ? 1.78 : 2.02, i === 0 ? 0.02 : 0.014, 10, 160]} />
						<meshStandardMaterial color={i === 0 ? COLORS.white : COLORS.gray} roughness={0.3} metalness={0.4} emissive={i === 0 ? COLORS.white : COLORS.gray} emissiveIntensity={0.35} />
					</mesh>
				) : null,
			)}

			{satellites.map((s, i) => (
				<Satellite key={i} sat={s} glowTex={glowTex} />
			))}
			<Dust dust={dust} glowTex={glowTex} />
		</>
	);
};
