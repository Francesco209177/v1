"""Icone disegnate dal programma (nessun file esterno) e la mascotte originale del Polpo."""

from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QIcon, QPainter, QPainterPath, QPen, QPixmap

_cache: dict[tuple[str, str, int, str, bool], QIcon] = {}
STYLE = {"filled": False}  # stile delle icone scelto in Impostazioni › Aspetto


def icon(key: str, color: str, size: int = 64, selected: str = "") -> QIcon:
    """``selected``: colore da usare quando la voce è selezionata (sfondo colorato)."""
    k = (key, color, size, selected, STYLE["filled"])
    if k not in _cache:
        ic = QIcon(pixmap(key, color, size))
        if selected:
            ic.addPixmap(pixmap(key, selected, size), QIcon.Mode.Selected)
        _cache[k] = ic
    return _cache[k]


def check_mark_file(color: str) -> str:
    """PNG di un segno di spunta (per le caselle nei fogli di stile Qt, che vogliono un file)."""
    import tempfile
    from pathlib import Path

    from PySide6.QtGui import QImage

    folder = Path(tempfile.gettempdir()) / "polpo-studio"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"spunta-{color.lstrip('#')}.png"
    if not path.exists():
        img = QImage(32, 32, QImage.Format.Format_ARGB32)
        img.fill(Qt.GlobalColor.transparent)
        p = QPainter(img)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(QPen(QColor(color), 4.5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin))
        path_line = QPainterPath()
        path_line.moveTo(7, 16.5)
        path_line.lineTo(13.5, 23)
        path_line.lineTo(25, 9)
        p.drawPath(path_line)
        p.end()
        img.save(str(path))
    return path.as_posix()


def pixmap(key: str, color: str, size: int = 64) -> QPixmap:
    pm = QPixmap(size, size)
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.scale(size / 64, size / 64)
    pen = QPen(QColor(color), 4.5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin)
    p.setPen(pen)
    if STYLE["filled"]:
        fill = QColor(color)
        fill.setAlpha(70)
        p.setBrush(QBrush(fill))
    else:
        p.setBrush(Qt.BrushStyle.NoBrush)
    _DRAW.get(key, _draw_dot)(p, QColor(color))
    p.end()
    return pm


def _arcs(p: QPainter, cx: float, cy: float, radii: list[float], start: int, span: int) -> None:
    for r in radii:
        p.drawArc(QRectF(cx - r, cy - r, 2 * r, 2 * r), start * 16, span * 16)


def _draw_dot(p: QPainter, c: QColor) -> None:
    p.drawEllipse(QRectF(20, 20, 24, 24))


def _draw_home(p: QPainter, c: QColor) -> None:
    for x, y in ((10, 10), (36, 10), (10, 36), (36, 36)):
        p.drawRoundedRect(QRectF(x, y, 18, 18), 4, 4)


def _draw_polpo(p: QPainter, c: QColor) -> None:
    path = QPainterPath()
    path.moveTo(14, 36)
    path.cubicTo(14, 8, 50, 8, 50, 36)
    p.drawPath(path)
    for x in (14, 25, 39, 50):
        t = QPainterPath()
        t.moveTo(x, 36)
        t.cubicTo(x - 3, 46, x + 5, 50, x + (2 if x < 32 else -2), 56)
        p.drawPath(t)
    p.setBrush(QBrush(c))
    p.drawEllipse(QPointF(25, 28), 2.5, 2.5)
    p.drawEllipse(QPointF(39, 28), 2.5, 2.5)


def _draw_radio(p: QPainter, c: QColor) -> None:
    p.drawLine(32, 30, 32, 56)
    p.drawLine(22, 56, 42, 56)
    _arcs(p, 32, 26, [8, 16], 30, 120)
    _arcs(p, 32, 26, [8, 16], 210, 120)
    p.setBrush(QBrush(c))
    p.drawEllipse(QPointF(32, 26), 3, 3)


def _draw_nfc(p: QPainter, c: QColor) -> None:
    p.drawRoundedRect(QRectF(8, 8, 48, 48), 10, 10)
    _arcs(p, 22, 32, [8, 15, 22], -45, 90)


def _draw_rfid(p: QPainter, c: QColor) -> None:
    p.drawRoundedRect(QRectF(6, 16, 52, 34), 6, 6)
    p.drawRoundedRect(QRectF(14, 25, 12, 10), 2, 2)
    p.drawLine(32, 28, 50, 28)
    p.drawLine(32, 38, 44, 38)


def _draw_infrared(p: QPainter, c: QColor) -> None:
    p.drawRoundedRect(QRectF(10, 22, 18, 36), 5, 5)
    p.drawLine(19, 30, 19, 30)
    _arcs(p, 19, 16, [8, 14], 20, 140)
    p.setBrush(QBrush(c))
    p.drawEllipse(QPointF(19, 31), 2.5, 2.5)
    p.drawEllipse(QPointF(19, 42), 2.5, 2.5)
    p.setBrush(Qt.BrushStyle.NoBrush)
    for i in range(3):
        p.drawLine(34 + i * 7, 14 + i * 3, 40 + i * 7, 10 + i * 3)


def _draw_gpio(p: QPainter, c: QColor) -> None:
    p.drawRoundedRect(QRectF(18, 18, 28, 28), 4, 4)
    for i in range(3):
        o = 24 + i * 8
        for a, b, x, y in ((o, 18, o, 8), (o, 46, o, 56), (18, o, 8, o), (46, o, 56, o)):
            p.drawLine(a, b, x, y)


def _draw_bluetooth(p: QPainter, c: QColor) -> None:
    path = QPainterPath()
    path.moveTo(20, 20)
    path.lineTo(44, 42)
    path.lineTo(32, 54)
    path.lineTo(32, 10)
    path.lineTo(44, 22)
    path.lineTo(20, 44)
    p.drawPath(path)


def _draw_usb(p: QPainter, c: QColor) -> None:
    p.drawLine(32, 8, 32, 50)
    p.drawLine(32, 8, 27, 15)
    p.drawLine(32, 8, 37, 15)
    p.drawLine(32, 36, 20, 28)
    p.drawLine(20, 28, 20, 22)
    p.drawLine(32, 30, 44, 22)
    p.drawRect(QRectF(41, 16, 7, 7))
    p.drawEllipse(QRectF(16, 17, 8, 8))
    p.setBrush(QBrush(c))
    p.drawEllipse(QPointF(32, 53), 5, 5)


def _draw_ibutton(p: QPainter, c: QColor) -> None:
    p.drawEllipse(QRectF(10, 18, 30, 30))
    p.drawEllipse(QRectF(18, 26, 14, 14))
    p.drawLine(38, 26, 54, 14)
    p.drawLine(48, 18, 52, 24)


def _draw_files(p: QPainter, c: QColor) -> None:
    path = QPainterPath()
    path.moveTo(8, 18)
    path.lineTo(26, 18)
    path.lineTo(31, 24)
    path.lineTo(56, 24)
    path.lineTo(56, 52)
    path.lineTo(8, 52)
    path.closeSubpath()
    p.drawPath(path)


def _draw_apps(p: QPainter, c: QColor) -> None:
    for x, y in ((10, 10), (36, 10), (10, 36)):
        p.drawRoundedRect(QRectF(x, y, 18, 18), 6, 6)
    p.drawEllipse(QRectF(36, 36, 18, 18))


def _draw_settings(p: QPainter, c: QColor) -> None:
    p.drawEllipse(QRectF(24, 24, 16, 16))
    for i in range(8):
        a = i * math.pi / 4
        p.drawLine(QPointF(32 + 15 * math.cos(a), 32 + 15 * math.sin(a)), QPointF(32 + 23 * math.cos(a), 32 + 23 * math.sin(a)))
    p.drawEllipse(QRectF(17, 17, 30, 30))


def _draw_activity(p: QPainter, c: QColor) -> None:
    for y in (16, 30, 44):
        p.drawLine(22, y, 54, y)
        p.drawPoint(12, y)


def _draw_security(p: QPainter, c: QColor) -> None:
    p.drawRoundedRect(QRectF(14, 28, 36, 28), 6, 6)
    p.drawArc(QRectF(20, 8, 24, 32), 0, 180 * 16)
    p.drawLine(20, 24, 20, 28)
    p.drawLine(44, 24, 44, 28)
    p.setBrush(QBrush(c))
    p.drawEllipse(QPointF(32, 41), 3.5, 3.5)


_DRAW = {
    "home": _draw_home,
    "polpo": _draw_polpo,
    "radio": _draw_radio,
    "nfc": _draw_nfc,
    "rfid": _draw_rfid,
    "infrared": _draw_infrared,
    "gpio": _draw_gpio,
    "bluetooth": _draw_bluetooth,
    "usb": _draw_usb,
    "ibutton": _draw_ibutton,
    "files": _draw_files,
    "apps": _draw_apps,
    "settings": _draw_settings,
    "activity": _draw_activity,
    "security": _draw_security,
}


def paint_mascot(p: QPainter, rect: QRectF, body: str, mood: str = "felice") -> None:
    """Il Polpo, la mascotte originale del progetto: testa tonda, guance, sei tentacoli arricciati.

    ``mood``: "felice", "collegato" (occhi a mezzaluna), "dorme" (occhi chiusi), "simulato" (occhiali a righe).
    """
    p.save()
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    s = min(rect.width(), rect.height()) / 100
    p.translate(rect.center().x() - 50 * s, rect.center().y() - 50 * s)
    p.scale(s, s)
    col = QColor(body)
    dark = col.darker(150)
    p.setPen(QPen(dark, 2.2))
    p.setBrush(QBrush(col))
    for i in range(6):  # tentacoli
        x = 22 + i * 11.2
        t = QPainterPath()
        t.moveTo(x - 4.5, 58)
        curl = 1 if i % 2 == 0 else -1
        t.cubicTo(x - 6, 74, x + 7 * curl, 80, x + 4 * curl, 92)
        t.cubicTo(x + 2 * curl, 96, x - 3 * curl, 94, x - 1 * curl, 90)
        t.cubicTo(x + 1 * curl, 82, x + 2, 74, x + 4.5, 58)
        p.drawPath(t)
    head = QPainterPath()
    head.moveTo(14, 62)
    head.cubicTo(8, 14, 92, 14, 86, 62)
    head.cubicTo(70, 70, 30, 70, 14, 62)
    p.drawPath(head)
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QBrush(col.lighter(130)))
    p.drawEllipse(QRectF(30, 22, 16, 9))  # riflesso
    p.setBrush(QBrush(QColor(255, 120, 140, 110)))
    p.drawEllipse(QRectF(22, 50, 12, 6))
    p.drawEllipse(QRectF(66, 50, 12, 6))
    ink = QColor("#1b1b22")
    p.setPen(QPen(ink, 3, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
    p.setBrush(Qt.BrushStyle.NoBrush)
    if mood == "dorme":
        p.drawArc(QRectF(31, 40, 12, 8), 200 * 16, 140 * 16)
        p.drawArc(QRectF(57, 40, 12, 8), 200 * 16, 140 * 16)
    elif mood == "collegato":
        p.drawArc(QRectF(31, 38, 12, 10), 20 * 16, 140 * 16)
        p.drawArc(QRectF(57, 38, 12, 10), 20 * 16, 140 * 16)
    else:
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(ink))
        p.drawEllipse(QRectF(32, 37, 10, 12))
        p.drawEllipse(QRectF(58, 37, 10, 12))
        p.setBrush(QBrush(QColor("white")))
        p.drawEllipse(QRectF(35, 39, 4, 4))
        p.drawEllipse(QRectF(61, 39, 4, 4))
        if mood == "simulato":
            p.setPen(QPen(QColor("#2b6cd6"), 2.4))
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawRoundedRect(QRectF(28, 34, 18, 18), 5, 5)
            p.drawRoundedRect(QRectF(54, 34, 18, 18), 5, 5)
            p.drawLine(46, 42, 54, 42)
    p.setPen(QPen(ink, 2.6, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawArc(QRectF(44, 50, 12, 8), 200 * 16, 140 * 16)
    p.restore()
