"""Temi: scuro, chiaro, alto contrasto, con un colore principale a scelta.

Gli stati non si distinguono mai solo con il colore: hanno sempre la loro parola.
"""

from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtGui import QColor

from .icons import check_mark_file


@dataclass(frozen=True)
class Palette:
    bg: str
    panel: str
    card: str
    text: str
    muted: str
    border: str
    hover: str
    ok: str
    warn: str
    sim: str
    exp: str
    off: str
    err: str
    on_status: str  # testo sopra i colori di stato


PALETTES = {
    "scuro": Palette("#13151b", "#191c24", "#20242e", "#e9ebf1", "#a3abbb", "#2e3340", "#2a2f3b",
                     "#2fae6c", "#d9952b", "#4a8fe0", "#c15fd0", "#6d7382", "#e0564d", "#0d0f13"),
    "chiaro": Palette("#f3f4f7", "#ffffff", "#ffffff", "#1a1d24", "#566072", "#d7dae1", "#eceef3",
                      "#1d8a52", "#a86a00", "#1f68c1", "#9a37ab", "#646b78", "#c0392b", "#ffffff"),
    "alto_contrasto": Palette("#000000", "#000000", "#000000", "#ffffff", "#ffff00", "#ffffff", "#1a1a1a",
                              "#00ff66", "#ffcc00", "#33ccff", "#ff66ff", "#c0c0c0", "#ff4444", "#000000"),
}  # fmt: skip

STATUS_COLOR_KEY = {
    "disponibile": "ok",
    "richiede_hardware": "warn",
    "simulato": "sim",
    "sperimentale": "exp",
    "non_disponibile": "off",
}
PRESENCE_COLOR_KEY = {
    "rilevato": "ok",
    "dichiarato": "ok",
    "simulato": "sim",
    "non_verificabile": "warn",
    "assente": "off",
}


def palette(theme: str) -> Palette:
    return PALETTES.get(theme, PALETTES["scuro"])


def _rgba(color: str, alpha: float) -> str:
    c = QColor(color)
    return f"rgba({c.red()},{c.green()},{c.blue()},{alpha:.2f})"


def effective_accent(theme: str, accent: str) -> str:
    return "#ffd400" if theme == "alto_contrasto" else accent


def accent_text(accent: str) -> str:
    """Colore leggibile sopra il colore principale."""
    return "#000000" if QColor(accent).lightnessF() > 0.6 else "#ffffff"


def stylesheet(theme: str, accent: str, font_scale: float = 1.0, density: str = "comoda") -> str:
    p = palette(theme)
    accent = effective_accent(theme, accent)
    acc = QColor(accent)
    acc_text = accent_text(accent)
    fs = max(10, round(13 * font_scale))
    hc = theme == "alto_contrasto"
    bw = 2 if hc else 1
    tight = density == "compatta"
    item_pad = "5px 8px" if tight else "8px 10px"
    btn_pad = "3px 10px" if tight else "6px 14px"
    field_pad = "3px 6px" if tight else "5px 8px"
    badges = []
    for value, key in STATUS_COLOR_KEY.items():
        col = getattr(p, key)
        badges.append(
            f'QLabel[status="{value}"] {{ background: {col}; color: {p.on_status}; border-radius: 9px; '
            f"padding: 2px 9px; font-weight: 600; }}"
        )
    for value, key in PRESENCE_COLOR_KEY.items():
        col = getattr(p, key)
        badges.append(
            f'QLabel[presence="{value}"] {{ background: {_rgba(col, 0.18 if not hc else 0)}; color: {col}; '
            f"border: {bw}px solid {col}; border-radius: 9px; padding: 1px 8px; font-weight: 600; }}"
        )
    return f"""
* {{ font-size: {fs}px; }}
QWidget {{ background: {p.bg}; color: {p.text}; }}
QMainWindow, QDialog {{ background: {p.bg}; }}
QToolTip {{ background: {p.card}; color: {p.text}; border: 1px solid {p.border}; padding: 4px; }}
QLabel {{ background: transparent; }}
QLabel[muted="true"] {{ color: {p.muted}; }}
QLabel[heading="1"] {{ font-size: {round(fs * 1.75)}px; font-weight: 700; }}
QLabel[heading="2"] {{ font-size: {round(fs * 1.25)}px; font-weight: 700; }}
QLabel[heading="3"] {{ font-weight: 700; }}
QLabel[sim="true"] {{ background: {p.sim}; color: {p.on_status}; border-radius: 8px; padding: 2px 8px; font-weight: 700; }}
QLabel[lab="true"] {{ color: {p.warn}; border: {bw}px solid {p.warn}; border-radius: 8px; padding: 1px 6px; }}
QLabel[error="true"] {{ color: {p.err}; }}
{chr(10).join(badges)}
QFrame#card {{ background: {p.card}; border: {bw}px solid {p.border}; border-radius: 12px; }}
QFrame#capRow {{ background: {p.card}; border: {bw}px solid {p.border}; border-radius: 10px; }}
QFrame#note {{ background: {_rgba(accent, 0.12)}; border: {bw}px solid {_rgba(accent, 0.55)}; border-radius: 10px; }}
QListWidget#sidebar {{ background: {p.panel}; border: none; border-right: {bw}px solid {p.border}; padding: 8px 6px; outline: 0; }}
QListWidget#sidebar::item {{ padding: {item_pad}; border-radius: 8px; margin: 1px 0; }}
QListWidget#sidebar::item:hover {{ background: {p.hover}; }}
QListWidget#sidebar::item:selected {{ background: {accent}; color: {acc_text}; }}
QPushButton {{ background: {p.card}; border: {bw}px solid {p.border}; border-radius: 8px; padding: {btn_pad}; }}
QPushButton:hover {{ background: {p.hover}; border-color: {accent}; }}
QPushButton:pressed {{ background: {p.border}; }}
QPushButton:disabled {{ color: {p.muted}; border-color: {p.border}; }}
QPushButton[primary="true"] {{ background: {accent}; color: {acc_text}; border-color: {accent}; font-weight: 600; }}
QPushButton[primary="true"]:hover {{ background: {acc.lighter(115).name()}; }}
QPushButton[primary="true"]:disabled {{ background: {p.hover}; color: {p.muted}; border-color: {p.border}; font-weight: 600; }}
QPushButton[flat="true"] {{ background: transparent; border: none; padding: 4px 8px; }}
QPushButton:focus, QComboBox:focus, QLineEdit:focus, QSpinBox:focus {{ border: 2px solid {accent}; }}
QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QPlainTextEdit, QTextEdit {{
    background: {p.panel}; border: {bw}px solid {p.border}; border-radius: 7px; padding: {field_pad};
    selection-background-color: {accent}; selection-color: {acc_text}; }}
QComboBox QAbstractItemView {{ background: {p.panel}; selection-background-color: {accent}; selection-color: {acc_text}; }}
QCheckBox, QRadioButton {{ spacing: 8px; background: transparent; }}
QCheckBox:disabled {{ color: {p.muted}; }}
QCheckBox::indicator, QAbstractItemView::indicator {{ width: 16px; height: 16px; border: {max(bw, 2)}px solid {p.muted}; border-radius: 4px; background: {p.panel}; }}
QCheckBox::indicator:hover, QAbstractItemView::indicator:hover {{ border-color: {accent}; }}
QCheckBox:focus {{ color: {p.text}; }}
QCheckBox::indicator:focus {{ border-color: {accent}; }}
QCheckBox::indicator:checked, QAbstractItemView::indicator:checked {{ background: {accent}; border-color: {accent}; image: url({check_mark_file(acc_text)}); }}
QCheckBox::indicator:disabled {{ background: {p.hover}; border-color: {p.border}; }}
QTableWidget, QTreeWidget, QListWidget {{ background: {p.panel}; border: {bw}px solid {p.border}; border-radius: 8px;
    gridline-color: {p.border}; alternate-background-color: {p.card}; }}
QHeaderView::section {{ background: {p.card}; color: {p.muted}; border: none; border-bottom: {bw}px solid {p.border}; padding: 6px; font-weight: 600; }}
QTableWidget::item:selected, QTreeWidget::item:selected, QListWidget::item:selected {{ background: {_rgba(accent, 0.35)}; color: {p.text}; }}
QScrollArea {{ border: none; }}
QScrollBar:vertical {{ background: transparent; width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: {p.border}; border-radius: 4px; min-height: 30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
QStatusBar {{ background: {p.panel}; border-top: {bw}px solid {p.border}; }}
QStatusBar QLabel {{ padding: 0 6px; }}
QMenuBar {{ background: {p.panel}; }}
QMenuBar::item:selected, QMenu::item:selected {{ background: {accent}; color: {acc_text}; }}
QMenu {{ background: {p.panel}; border: 1px solid {p.border}; }}
QGroupBox {{ border: {bw}px solid {p.border}; border-radius: 10px; margin-top: 14px; padding: 12px 10px 10px 10px; font-weight: 700; }}
QGroupBox::title {{ subcontrol-origin: margin; left: 12px; padding: 0 4px; }}
QProgressBar {{ background: {p.panel}; border: {bw}px solid {p.border}; border-radius: 6px; text-align: center; }}
QProgressBar::chunk {{ background: {accent}; border-radius: 5px; }}
"""
