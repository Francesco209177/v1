"""Lingue dell'interfaccia: italiano (predefinito) e inglese.

Ogni testo è scritto nel punto in cui serve, in entrambe le lingue: ``tr("Collega", "Connect")``.
Così nessuna frase resta senza traduzione.
"""

from __future__ import annotations

LANGUAGES = {"it": "Italiano", "en": "English"}
_lang = "it"


def set_language(lang: str) -> None:
    global _lang
    _lang = lang if lang in LANGUAGES else "it"


def language() -> str:
    return _lang


def tr(it: str, en: str, **kw: object) -> str:
    s = en if _lang == "en" else it
    return s.format(**kw) if kw else s


class T:
    """Un testo nelle due lingue; ``str(t)`` dà quello della lingua attuale."""

    __slots__ = ("it", "en")

    def __init__(self, it: str, en: str) -> None:
        self.it = it
        self.en = en

    def __str__(self) -> str:
        return tr(self.it, self.en)

    def __repr__(self) -> str:
        return f"T({self.it!r}, {self.en!r})"

    def format(self, **kw: object) -> str:
        return str(self).format(**kw)
