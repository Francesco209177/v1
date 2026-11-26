#!/usr/bin/env python3
"""Aggiorna MareaProfonda/Resources/Localizable.xcstrings con i testi dell'interfaccia presenti nel codice.

Uso:  python3 Tools/l10n/sync.py            (dalla radice del repository)

Cerca `String(localized: "...")` e i letterali passati a `Text(...)` in SwiftUI. Le interpolazioni
`\\(...)` diventano segnaposto, come fa Xcode: %lld per i numeri interi, %@ per tutto il resto.
La lingua di origine è l'italiano: ogni chiave è già il testo italiano. Le traduzioni esistenti
nel catalogo vengono conservate; per aggiungere una lingua basta aprire il catalogo in Xcode.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCES = os.path.join(ROOT, "MareaProfonda")
CATALOG = os.path.join(SOURCES, "Resources", "Localizable.xcstrings")

STARTS = [re.compile(r'String\(localized:\s*"'), re.compile(r'\bText\("')]


def read_literal(text: str, start: int) -> tuple[str, int]:
    """Legge un letterale Swift a partire dal primo carattere dopo le virgolette d'apertura.
    Tiene conto delle interpolazioni, che possono contenere parentesi e altre stringhe."""
    i, depth, out = start, 0, []
    while i < len(text):
        ch = text[i]
        if depth == 0:
            if ch == "\\" and text.startswith("\\(", i):
                depth = 1
                out.append("\\(")
                i += 2
                continue
            if ch == "\\":
                out.append(text[i:i + 2])
                i += 2
                continue
            if ch == '"':
                return "".join(out), i + 1
        else:
            if ch == '"':
                # stringa dentro l'interpolazione: si salta fino alla sua chiusura
                j = i + 1
                while j < len(text) and text[j] != '"':
                    j += 2 if text[j] == "\\" else 1
                out.append(text[i:j + 1].replace('"', "'"))
                i = j + 1
                continue
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
        out.append(ch)
        i += 1
    return "".join(out), i

# Espressioni interpolate che sono numeri interi: finiscono con uno di questi nomi, o sono conti evidenti.
INT_NAMES = {"count", "gold", "cost", "day", "fame", "points", "score", "left", "mine", "his", "level", "wage", "hire", "minFame", "prize",
             "target", "tiles", "cards", "stock", "portions", "price", "chosen", "slots", "next", "born", "ready", "id", "goal", "seedCost",
             "yield", "revenue", "tips", "served", "lost", "bestCombo", "total", "coin", "bet", "lives", "best", "rival", "combo", "chapter", "offset",
             "number", "caught", "lastWages", "depthFrom", "depthTo", "seen", "known", "logged"}


def placeholder(expr: str) -> str:
    expr = expr.strip()
    if expr.endswith(".text()") or "String(" in expr or "joined" in expr or expr.endswith("Text") or expr.endswith("Name") or expr.endswith("name"):
        return "%@"
    if re.search(r"[+\-*/]\s*\d+\s*$", expr) or re.search(r"\bInt\(", expr) or re.search(r"\b(max|min)\(", expr) or "??" in expr and re.search(r"\?\?\s*\d+", expr):
        return "%lld"
    last = re.split(r"[.\s]", expr)[-1].strip("()")
    return "%lld" if last in INT_NAMES else "%@"


def to_key(literal: str) -> tuple[str, bool]:
    """Da letterale Swift a chiave del catalogo. Ritorna anche se conteneva interpolazioni."""
    out, i, had = [], 0, False
    while i < len(literal):
        if literal.startswith("\\(", i):
            depth, j = 1, i + 2
            while j < len(literal) and depth > 0:
                if literal[j] == "(":
                    depth += 1
                elif literal[j] == ")":
                    depth -= 1
                j += 1
            out.append(placeholder(literal[i + 2:j - 1]))
            had = True
            i = j
        elif literal[i] == "\\" and i + 1 < len(literal):
            out.append({"n": "\n", '"': '"', "\\": "\\"}.get(literal[i + 1], literal[i + 1]))
            i += 2
        else:
            out.append(literal[i].replace("%", "%%") if literal[i] == "%" else literal[i])
            i += 1
    return "".join(out), had


def main() -> None:
    keys: dict[str, str] = {}
    for folder, _, files in os.walk(SOURCES):
        for name in sorted(files):
            if not name.endswith(".swift"):
                continue
            text = open(os.path.join(folder, name), encoding="utf-8").read()
            for pattern in STARTS:
                for match in pattern.finditer(text):
                    literal, end = read_literal(text, match.end())
                    # Solo i letterali che chiudono subito la chiamata: Text("...") e String(localized: "...").
                    if pattern is STARTS[1] and not text.startswith(")", end):
                        continue
                    key, _ = to_key(literal)
                    if key.strip():
                        keys.setdefault(key, name)
    catalog = {"sourceLanguage": "it", "strings": {}, "version": "1.0"}
    if os.path.exists(CATALOG):
        try:
            catalog = json.load(open(CATALOG, encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    old = catalog.get("strings", {})
    strings = {}
    for key in sorted(keys):
        # Le traduzioni già fatte restano; le chiavi sparite dal codice vengono tolte.
        strings[key] = old.get(key, {})
    catalog["strings"] = strings
    catalog["sourceLanguage"] = "it"
    catalog["version"] = "1.0"
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2, sort_keys=True, separators=(",", " : "))
        f.write("\n")
    print(f"{len(strings)} testi nel catalogo")
    if "--list" in sys.argv:
        for key in sorted(keys):
            if "%" in key:
                print("  ", key)


if __name__ == "__main__":
    main()
