"""Icone a pixel per i pulsanti dell'interfaccia. Sono bianche: il gioco le colora."""
from forge import Grid, Palette, Sheet

PAL = Palette("icon", {"w": "#ffffff", "g": "#ffffffa0"})

ICONS = {
    # arpione
    "icon_harpoon": [
        "..........ww",
        ".........www",
        "........wwww",
        ".......ww.w.",
        "......ww....",
        ".....ww.....",
        "....ww......",
        "...ww.......",
        "w.ww........",
        "www.........",
        "www.........",
        "wwww........",
    ],
    # mano: azione, raccogli
    "icon_hand": [
        "....w.w.....",
        "..w.w.w.w...",
        "..w.w.w.w...",
        "..w.w.w.w...",
        "..w.w.w.w.w.",
        "..wwwwwww.w.",
        "w.wwwwwww.w.",
        "wwwwwwwwwww.",
        ".wwwwwwwwww.",
        "..wwwwwwww..",
        "...wwwwww...",
        "...wwwwww...",
    ],
    # scatto
    "icon_dash": [
        "............",
        ".w....w.....",
        ".ww...ww....",
        "..ww...ww...",
        "...ww...ww..",
        "....ww...ww.",
        "....ww...ww.",
        "...ww...ww..",
        "..ww...ww...",
        ".ww...ww....",
        ".w....w.....",
        "............",
    ],
    # rete: arma secondaria
    "icon_net": [
        "..wwwwwwww..",
        ".w.w..w..ww.",
        "w..w..w..w.w",
        "wwwwwwwwwwww",
        "w..w..w..w.w",
        "w..w..w..w.w",
        "wwwwwwwwwwww",
        "w..w..w..w.w",
        ".w.w..w..ww.",
        "..wwwwwwww..",
        "....ww......",
        "....ww......",
    ],
    # sacca: inventario
    "icon_bag": [
        "....wwww....",
        "...w....w...",
        "...w....w...",
        ".wwwwwwwwww.",
        "wwwwwwwwwwww",
        "ww.wwwwww.ww",
        "ww.wwwwww.ww",
        "wwwwwwwwwwww",
        "wwwwwwwwwwww",
        "wwwwwwwwwwww",
        ".wwwwwwwwww.",
        "..wwwwwwww..",
    ],
    # pausa
    "icon_pause": [
        "............",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "..www..www..",
        "............",
    ],
    # polmoni: il Fiato
    "icon_breath": [
        ".....ww.....",
        ".....ww.....",
        ".ww..ww..ww.",
        "wwww.ww.wwww",
        "wwww.ww.wwww",
        "wwwwwwwwwwww",
        "wwwwwwwwwwww",
        "wwwwww.wwwww",
        "wwwww...wwww",
        "wwww.....www",
        ".ww.......ww",
        "............",
    ],
    # peso della sacca
    "icon_weight": [
        "....wwww....",
        "...w....w...",
        "...w....w...",
        "..wwwwwwww..",
        ".wwwwwwwwww.",
        ".wwwwwwwwww.",
        "wwww.ww.wwww",
        "wwww.ww.wwww",
        "wwwwwwwwwwww",
        "wwwwwwwwwwww",
        "wwwwwwwwwwww",
        ".wwwwwwwwww.",
    ],
    # freccia di profondità
    "icon_depth": [
        ".....ww.....",
        ".....ww.....",
        ".....ww.....",
        ".....ww.....",
        ".....ww.....",
        ".....ww.....",
        "ww...ww...ww",
        ".ww..ww..ww.",
        "..ww.ww.ww..",
        "...wwwwww...",
        "....wwww....",
        ".....ww.....",
    ],
}


def build(out_dir: str) -> str:
    sheet = Sheet("Icone dell'interfaccia")
    sheet.add_palette(PAL)
    for name, rows in ICONS.items():
        sheet.add(name, Grid.from_rows(rows), PAL)
    path = f"{out_dir}/ui_icons.spr"
    sheet.write(path)
    return path
