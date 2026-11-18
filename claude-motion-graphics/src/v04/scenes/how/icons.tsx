import React from 'react';

/** Icone SVG minimali (niente emoji: il font non è garantito nel render). */

export const IconWarn: React.FC<{size?: number; color: string; ink?: string}> = ({size = 28, color, ink = '#0A0C0D'}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none'}}>
		<path d="M12 2.2 L23 21.2 H1 Z" fill={color} strokeLinejoin="round" />
		<rect x="10.8" y="8.6" width="2.4" height="7" rx="1.2" fill={ink} />
		<circle cx="12" cy="18.2" r="1.4" fill={ink} />
	</svg>
);

export const IconMail: React.FC<{size?: number; color: string}> = ({size = 32, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none'}}>
		<rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke={color} strokeWidth="2" />
		<path d="M3.5 6.5 L12 13 L20.5 6.5" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
	</svg>
);

export const IconKey: React.FC<{size?: number; color: string}> = ({size = 32, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none'}}>
		<circle cx="7.5" cy="12" r="4.5" fill="none" stroke={color} strokeWidth="2" />
		<path d="M12 12 H22 M18.5 12 V16 M21.5 12 V15" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
	</svg>
);

export const IconBack: React.FC<{size?: number; color: string}> = ({size = 30, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none'}}>
		<path d="M15 4 L7 12 L15 20" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const IconReload: React.FC<{size?: number; color: string; angle?: number}> = ({size = 30, color, angle = 0}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none', transform: `rotate(${angle}deg)`}}>
		<path d="M19.5 12 A7.5 7.5 0 1 1 16.8 6.2" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
		<path d="M17.5 2.8 V7 H13.3" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

/** Spinner: arco che ruota (angolo dal frame). */
export const Spinner: React.FC<{size?: number; color: string; angle: number}> = ({size = 30, color, angle}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', flex: 'none', transform: `rotate(${angle}deg)`}}>
		<circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
		<path d="M12 3 A9 9 0 0 1 21 12" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
	</svg>
);
