"""Avvio: python -m iphone_backup [--host 0.0.0.0] [--port 8765] [--data DIR] [--backups DIR] [--demo]"""

from __future__ import annotations

import argparse
import os


def main() -> None:
    parser = argparse.ArgumentParser(prog="iphone-backup", description="Backup iPhone con interfaccia web")
    parser.add_argument("--host", default=os.environ.get("IPHONE_BACKUP_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("IPHONE_BACKUP_PORT", "8765")))
    parser.add_argument("--data", default=None, help="cartella dati (predefinita /var/lib/iphone-backup)")
    parser.add_argument("--backups", default=None, help="cartella dei backup (predefinita <data>/backups)")
    parser.add_argument("--demo", action="store_true", default=os.environ.get("IPHONE_BACKUP_DEMO") == "1",
                        help="iPhone simulato, per provare l'interfaccia")
    args = parser.parse_args()

    import uvicorn

    from .config import Paths
    from .service import BackupService
    from .web import create_app

    paths = Paths.from_env(args.data, args.backups)
    if args.demo:
        from .fake_device import FakeGateway

        gateway = FakeGateway()
    else:
        from .device import RealGateway

        gateway = RealGateway(paths)
    service = BackupService(paths, gateway, demo=args.demo)
    app = create_app(service)
    print(f"Interfaccia web su http://{args.host}:{args.port}  (dati: {paths.data}, backup: {paths.backups})", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", proxy_headers=False)


if __name__ == "__main__":
    main()
