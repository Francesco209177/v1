"""Calcolatori di elettronica: legge di Ohm, partitore, resistenza per LED, codice colori."""

from __future__ import annotations

import math

E12 = (1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2)
E24 = (1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1)
COLORS = ("nero", "marrone", "rosso", "arancione", "giallo", "verde", "blu", "viola", "grigio", "bianco")
COLORS_EN = ("black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white")
MULTIPLIER = {**{c: 10**i for i, c in enumerate(COLORS)}, "oro": 0.1, "argento": 0.01}
TOLERANCE = {"marrone": 1.0, "rosso": 2.0, "verde": 0.5, "blu": 0.25, "viola": 0.1, "grigio": 0.05, "oro": 5.0, "argento": 10.0}


def ohm(v: float | None = None, i: float | None = None, r: float | None = None) -> dict[str, float]:
    """Dati due valori tra tensione (V), corrente (A) e resistenza (Ω), calcola il terzo e la potenza."""
    known = sum(x is not None for x in (v, i, r))
    if known != 2:
        raise ValueError("servono esattamente due valori tra V, I e R")
    if v is None:
        v = i * r  # type: ignore[operator]
    elif i is None:
        if r == 0:
            raise ValueError("R non può essere zero")
        i = v / r  # type: ignore[operator]
    else:
        if i == 0:
            raise ValueError("I non può essere zero")
        r = v / i
    return {"v": v, "i": i, "r": r, "p": v * i}  # type: ignore[operator]


def divider(vin: float, r1: float, r2: float) -> float:
    if r1 + r2 <= 0:
        raise ValueError("R1 + R2 deve essere positivo")
    return vin * r2 / (r1 + r2)


def nearest_standard(value: float, series: tuple[float, ...] = E12, up: bool = True) -> float:
    """Il valore standard più vicino (verso l'alto se ``up``, per non superare la corrente voluta)."""
    if value <= 0:
        raise ValueError("valore non positivo")
    decade = 10 ** math.floor(math.log10(value))
    candidates = [s * decade for s in series] + [series[0] * decade * 10]
    if up:
        return min((c for c in candidates if c >= value * (1 - 1e-9)), default=candidates[-1])
    return min(candidates, key=lambda c: abs(c - value))


def led_resistor(supply_v: float, led_v: float, current_ma: float) -> dict[str, float]:
    if supply_v <= led_v:
        raise ValueError("la tensione di alimentazione deve superare quella del LED")
    if current_ma <= 0:
        raise ValueError("corrente non positiva")
    i = current_ma / 1000
    exact = (supply_v - led_v) / i
    std = nearest_standard(exact)
    real_i = (supply_v - led_v) / std
    return {"exact": exact, "standard": std, "current_ma": real_i * 1000, "power_w": real_i**2 * std}


def decode_bands(bands: list[str]) -> tuple[float, float | None]:
    """Colori in italiano (4 o 5 fasce) -> (ohm, tolleranza %)."""
    b = [x.strip().lower() for x in bands]
    if len(b) not in (3, 4, 5):
        raise ValueError("servono 3, 4 o 5 fasce")
    digits_n = 3 if len(b) == 5 else 2
    try:
        digits = [COLORS.index(c) for c in b[:digits_n]]
        mult = MULTIPLIER[b[digits_n]]
    except (ValueError, KeyError):
        raise ValueError("colore non valido per questa posizione") from None
    value = int("".join(str(d) for d in digits)) * mult
    tol = TOLERANCE.get(b[digits_n + 1]) if len(b) > digits_n + 1 else None
    if len(b) > digits_n + 1 and tol is None:
        raise ValueError("colore di tolleranza non valido")
    return round(value, 4), tol


def encode_bands(ohms: float, five: bool = False) -> list[str]:
    """Ohm -> colori (cifre + moltiplicatore), senza la fascia di tolleranza."""
    if ohms <= 0:
        raise ValueError("valore non positivo")
    n = 3 if five else 2
    exp = math.floor(math.log10(ohms)) - (n - 1)
    digits = round(ohms / 10**exp)
    if digits >= 10**n:
        digits //= 10
        exp += 1
    if exp < -2 or exp > 9:
        raise ValueError("valore fuori dalla gamma del codice colori")
    mult = {-1: "oro", -2: "argento"}.get(exp) or COLORS[exp]
    return [COLORS[int(d)] for d in f"{digits:0{n}d}"] + [mult]


def format_ohms(v: float) -> str:
    for unit, f in (("MΩ", 1e6), ("kΩ", 1e3)):
        if v >= f:
            return f"{v / f:g} {unit}".replace(".", ",")
    return f"{v:g} Ω".replace(".", ",")
