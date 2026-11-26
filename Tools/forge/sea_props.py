"""Oggetti e particelle del mare: bolle, plancton e (più avanti) flora, relitti, barca."""
from forge import Grid, Palette, Sheet

PAL = Palette("sea", {
    "b": "#d6f3fbe6",  # bordo della bolla
    "i": "#bfe9f748",  # interno traslucido
    "w": "#ffffff",    # riflesso
    "p": "#e8f6d8b0",  # plancton chiaro
    "q": "#a8d8c880",  # plancton lontano
})

BUBBLES = [
    [".b.",
     "bib",
     ".b."],
    [".bbb.",
     "bwiib",
     "biiib",
     "biiib",
     ".bbb."],
    ["..bbb..",
     ".bwwib.",
     "bwiiiib",
     "biiiiib",
     "biiiiib",
     ".biiib.",
     "..bbb.."],
]

PLANKTON = [
    ["p"],
    ["q"],
    [".p.",
     "pqp",
     ".p."],
]


def build(out_dir: str) -> str:
    sheet = Sheet("Mare: particelle e oggetti")
    sheet.add_palette(PAL)
    for i, rows in enumerate(BUBBLES):
        sheet.add(f"bubble_{i}", Grid.from_rows(rows), PAL)
    for i, rows in enumerate(PLANKTON):
        sheet.add(f"plankton_{i}", Grid.from_rows(rows), PAL)
    path = f"{out_dir}/sea_props.spr"
    sheet.write(path)
    return path
