"""Interfaccia web (FastAPI + Jinja2): pagine in italiano e API JSON usate dalla pagina."""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, Form, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from . import __version__
from . import backups as backup_store
from . import whatsapp as wa
from .auth import hash_password, verify_password
from .jobs import JobBusy, UserFacingError, describe_error
from .service import BackupService

HERE = Path(__file__).parent
PUBLIC_PATHS = ("/login", "/setup", "/static/", "/manifest.webmanifest", "/favicon.ico")


def format_when(value) -> str:
    if not value:
        return "mai"
    moment = value if isinstance(value, datetime) else None
    if moment is None:
        try:
            moment = datetime.fromisoformat(str(value))
        except ValueError:
            return str(value)
    if moment.tzinfo is not None:
        moment = moment.astimezone().replace(tzinfo=None)
    today = datetime.now().date()
    clock = moment.strftime("%H:%M")
    if moment.date() == today:
        return f"oggi alle {clock}"
    if (today - moment.date()).days == 1:
        return f"ieri alle {clock}"
    if (moment.date() - today).days == 1:
        return f"domani alle {clock}"
    return moment.strftime("%d/%m/%Y %H:%M")


GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
        "ottobre", "novembre", "dicembre"]


def format_day(value) -> str:
    try:
        moment = datetime.fromisoformat(str(value))
    except ValueError:
        return "?"
    if moment.tzinfo is not None:
        moment = moment.astimezone().replace(tzinfo=None)
    delta = (datetime.now().date() - moment.date()).days
    if delta == 0:
        return "Oggi"
    if delta == 1:
        return "Ieri"
    text = f"{GIORNI[moment.weekday()]} {moment.day} {MESI[moment.month - 1]}"
    return text if moment.year == datetime.now().year else f"{text} {moment.year}"


def create_app(service: BackupService, start_scheduler: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(service.scheduler_loop()) if start_scheduler else None
        service.events.info(f"Servizio avviato (versione {__version__}{', DEMO' if service.demo else ''}).")
        yield
        if task:
            task.cancel()
        service.close_whatsapp()

    app = FastAPI(title="Backup iPhone", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    templates = Jinja2Templates(directory=str(HERE / "templates"))
    templates.env.filters["when"] = format_when
    templates.env.filters["size"] = backup_store.human_size
    templates.env.filters["day"] = format_day
    app.mount("/static", StaticFiles(directory=str(HERE / "static")), name="static")
    failed_logins: dict[str, list[float]] = {}

    # --- autenticazione ---------------------------------------------------------------------

    @app.middleware("http")
    async def require_login(request: Request, call_next):
        path = request.url.path
        if not any(path == p or path.startswith(p) for p in PUBLIC_PATHS):
            if not service.settings.web_password_hash:
                return RedirectResponse("/setup", status_code=303)
            if not request.session.get("auth"):
                if path.startswith("/api/"):
                    return JSONResponse({"error": "Sessione scaduta: accedi di nuovo."}, status_code=401)
                return RedirectResponse("/login", status_code=303)
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    # Registrato dopo: Starlette esegue per primo l'ultimo middleware aggiunto, quindi la sessione è pronta.
    app.add_middleware(
        SessionMiddleware, secret_key=service.settings.session_secret, session_cookie="iphone_backup",
        max_age=30 * 24 * 3600, same_site="strict", https_only=False,
    )

    def render(request: Request, name: str, **context) -> HTMLResponse:
        context.update(
            request=request,
            service=service,
            settings=service.settings,
            device=service.device,
            demo=service.demo,
            version=__version__,
            nav=name.split(".")[0],
        )
        return templates.TemplateResponse(request, name, context)

    @app.get("/setup", response_class=HTMLResponse)
    async def setup_page(request: Request):
        if service.settings.web_password_hash:
            return RedirectResponse("/login", status_code=303)
        return render(request, "setup.html", error=None)

    @app.post("/setup")
    async def setup_submit(request: Request, password: str = Form(...), confirm: str = Form(...)):
        if service.settings.web_password_hash:
            return RedirectResponse("/login", status_code=303)
        if len(password) < 8:
            return render(request, "setup.html", error="La password deve avere almeno 8 caratteri.")
        if password != confirm:
            return render(request, "setup.html", error="Le due password non coincidono.")
        service.settings.web_password_hash = await asyncio.to_thread(hash_password, password)
        service.store.save()
        request.session["auth"] = True
        service.events.info("Password dell'interfaccia web impostata.")
        return RedirectResponse("/", status_code=303)

    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request):
        if not service.settings.web_password_hash:
            return RedirectResponse("/setup", status_code=303)
        return render(request, "login.html", error=None)

    @app.post("/login")
    async def login_submit(request: Request, password: str = Form(...)):
        client = request.client.host if request.client else "?"
        attempts = [t for t in failed_logins.get(client, []) if time.time() - t < 600]
        if len(attempts) >= 10:
            return render(request, "login.html", error="Troppi tentativi: riprova tra 10 minuti.")
        ok = await asyncio.to_thread(verify_password, password, service.settings.web_password_hash)
        if not ok:
            attempts.append(time.time())
            failed_logins[client] = attempts
            await asyncio.sleep(1)
            return render(request, "login.html", error="Password errata.")
        failed_logins.pop(client, None)
        request.session["auth"] = True
        return RedirectResponse("/", status_code=303)

    @app.post("/logout")
    async def logout(request: Request):
        request.session.clear()
        return RedirectResponse("/login", status_code=303)

    # --- pagine -----------------------------------------------------------------------------

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(request: Request):
        return render(
            request, "dashboard.html", state=service.state, next_due=service.next_due(),
            disk=backup_store.disk_usage(service.paths.backups),
        )

    @app.get("/associa", response_class=HTMLResponse)
    async def pair_page(request: Request):
        return render(request, "pair.html", state=service.state)

    @app.get("/backup", response_class=HTMLResponse)
    async def backups_page(request: Request):
        items = await asyncio.to_thread(backup_store.list_backups, service.paths)
        return render(request, "backups.html", backups=items, disk=backup_store.disk_usage(service.paths.backups),
                      state=service.state)

    @app.get("/backup/scarica/{kind}/{udid}")
    async def download_backup(kind: str, udid: str):
        try:
            folder = backup_store.device_dir(service.paths, kind, udid)
        except ValueError:
            return PlainTextResponse("Backup non valido", status_code=404)
        if not (folder / "Manifest.plist").exists():
            return PlainTextResponse("Backup non trovato", status_code=404)
        name = f"backup-iphone-{udid[:8]}-{datetime.now():%Y%m%d}.zip"
        return StreamingResponse(
            backup_store.stream_zip(folder, udid), media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @app.get("/whatsapp", response_class=HTMLResponse)
    async def whatsapp_page(request: Request, app_key: Optional[str] = None):
        archive = service.whatsapp
        if archive is None:
            items = await asyncio.to_thread(backup_store.list_backups, service.paths, False)
            return render(request, "whatsapp_unlock.html", backups=items)
        archive.touch()
        apps = [(key, wa.APPS[key][0]) for key in archive.databases]
        current = app_key if app_key in archive.databases else apps[0][0]
        chats = await asyncio.to_thread(wa.list_chats, archive.db(current))
        return render(request, "whatsapp_chats.html", chats=chats, apps=apps, current=current,
                      source=archive.source_label)

    @app.get("/whatsapp/{app_key}/{chat_id}", response_class=HTMLResponse)
    async def whatsapp_chat(request: Request, app_key: str, chat_id: int, tutti: int = 0):
        archive = service.whatsapp
        if archive is None or app_key not in archive.databases:
            return RedirectResponse("/whatsapp", status_code=303)
        db = archive.db(app_key)
        chat = await asyncio.to_thread(wa.get_chat, db, chat_id)
        if chat is None:
            return RedirectResponse("/whatsapp", status_code=303)
        limit = None if tutti else 400
        messages = await asyncio.to_thread(wa.list_messages, db, chat_id, 0, limit)
        return render(request, "whatsapp_chat.html", chat=chat, messages=messages, app_key=app_key,
                      truncated=bool(limit and chat.count > limit))

    @app.get("/whatsapp/{app_key}/{chat_id}/esporta.{fmt}")
    async def whatsapp_export(app_key: str, chat_id: int, fmt: str):
        archive = service.whatsapp
        if archive is None or app_key not in archive.databases or fmt not in ("txt", "html"):
            return PlainTextResponse("Chat non disponibile: riapri le chat WhatsApp.", status_code=404)
        db = archive.db(app_key)
        chat = await asyncio.to_thread(wa.get_chat, db, chat_id)
        safe = "".join(ch for ch in (chat.name if chat else str(chat_id)) if ch.isalnum() or ch in " -_").strip() or "chat"
        if fmt == "txt":
            body = await asyncio.to_thread(wa.export_chat_text, db, chat_id)
            media_type = "text/plain; charset=utf-8"
        else:
            body = await asyncio.to_thread(wa.export_chat_html, db, chat_id)
            media_type = "text/html; charset=utf-8"
        return Response(body, media_type=media_type,
                        headers={"Content-Disposition": f'attachment; filename="WhatsApp - {safe}.{fmt}"'})

    @app.get("/whatsapp/{app_key}/media/{media_id}")
    async def whatsapp_media(app_key: str, media_id: int):
        archive = service.whatsapp
        if archive is None or app_key not in archive.databases:
            return PlainTextResponse("Chat non disponibili", status_code=404)
        found = await asyncio.to_thread(archive.media, app_key, media_id)
        if not found:
            return PlainTextResponse("Allegato non presente nel backup", status_code=404)
        path, mime = found
        return FileResponse(path, media_type=mime, filename=path.name,
                            content_disposition_type="inline" if mime.startswith(("image/", "audio/", "video/")) else "attachment")

    @app.get("/ripristina", response_class=HTMLResponse)
    async def restore_page(request: Request):
        items = await asyncio.to_thread(backup_store.list_backups, service.paths, False)
        return render(request, "restore.html", backups=[b for b in items if b.complete])

    @app.get("/impostazioni", response_class=HTMLResponse)
    async def settings_page(request: Request, salvato: int = 0, errore: str = ""):
        return render(request, "settings.html", saved=bool(salvato), error=errore, paths=service.paths)

    def settings_error(message: str) -> RedirectResponse:
        return RedirectResponse(f"/impostazioni?errore={quote(message)}", status_code=303)

    @app.post("/impostazioni")
    async def settings_submit(
        auto_backup: Optional[str] = Form(None), interval_hours: float = Form(24), retry_minutes: float = Form(30),
        extra_hosts: str = Form(""), keep_safe_copy: Optional[str] = Form(None), notify_url: str = Form(""),
    ):
        settings = service.settings
        settings.auto_backup = auto_backup is not None
        settings.interval_hours = min(max(interval_hours, 1), 24 * 30)
        settings.retry_minutes = min(max(retry_minutes, 5), 24 * 60)
        settings.extra_hosts = [h.strip() for h in extra_hosts.replace(",", "\n").splitlines() if h.strip()]
        settings.keep_safe_copy = keep_safe_copy is not None
        url = notify_url.strip()
        if url and not url.startswith(("http://", "https://")):
            return settings_error("L'indirizzo per le notifiche deve iniziare con https://")
        settings.notify_url = url
        service.store.save()
        service.events.info("Impostazioni salvate.")
        return RedirectResponse("/impostazioni?salvato=1", status_code=303)

    @app.post("/impostazioni/password")
    async def change_web_password(request: Request, current: str = Form(...), password: str = Form(...),
                                  confirm: str = Form(...)):
        ok = await asyncio.to_thread(verify_password, current, service.settings.web_password_hash)
        if not ok:
            return settings_error("Password attuale errata.")
        if len(password) < 8 or password != confirm:
            return settings_error("La nuova password deve avere almeno 8 caratteri e le due password devono coincidere.")
        service.settings.web_password_hash = await asyncio.to_thread(hash_password, password)
        service.store.save()
        service.events.info("Password dell'interfaccia web cambiata.")
        return RedirectResponse("/impostazioni?salvato=1", status_code=303)

    @app.get("/registro", response_class=HTMLResponse)
    async def log_page(request: Request):
        return render(request, "log.html", events=service.events.recent(400))

    @app.get("/manifest.webmanifest")
    async def manifest():
        return JSONResponse({
            "name": "Backup iPhone", "short_name": "Backup iPhone", "start_url": "/", "display": "standalone",
            "background_color": "#0b1220", "theme_color": "#0a6cff", "lang": "it",
            "icons": [{"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"}],
        }, media_type="application/manifest+json")

    @app.get("/favicon.ico")
    async def favicon():
        return FileResponse(HERE / "static" / "icon-192.png", media_type="image/png")

    # --- API --------------------------------------------------------------------------------

    def job_response(start) -> JSONResponse:
        try:
            job = start()
        except JobBusy as error:
            return JSONResponse({"error": str(error)}, status_code=409)
        except (UserFacingError, ValueError) as error:
            return JSONResponse({"error": str(error)}, status_code=400)
        return JSONResponse({"job": job.to_json()})

    async def json_body(request: Request) -> dict:
        try:
            data = await request.json()
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    @app.get("/api/status")
    async def api_status():
        due = service.next_due()
        return {
            "job": service.jobs.current.to_json() if service.jobs.current else None,
            "last_job": service.jobs.last.to_json(lines=40) if service.jobs.last else None,
            "device": service.device.__dict__ if service.device else None,
            "state": service.state,
            "next_due": due.isoformat(timespec="seconds") if due else None,
            "next_due_text": format_when(due) if due else None,
            "whatsapp_open": service.whatsapp is not None,
        }

    @app.get("/api/usb")
    async def api_usb():
        try:
            devices = await asyncio.to_thread(lambda: asyncio.run(service.gateway.list_usb()))
        except UserFacingError as error:
            return JSONResponse({"error": str(error)}, status_code=400)
        except Exception as error:  # noqa: BLE001
            return JSONResponse({"error": describe_error(error)}, status_code=500)
        return {"devices": [d.to_json() for d in devices]}

    @app.post("/api/backup")
    async def api_backup():
        return job_response(lambda: service.start_backup("manuale"))

    @app.post("/api/check")
    async def api_check():
        return job_response(service.start_check)

    @app.post("/api/pair")
    async def api_pair(request: Request):
        data = await json_body(request)
        udid = str(data.get("udid", "")).strip()
        if not udid:
            return JSONResponse({"error": "Scegli l'iPhone da associare."}, status_code=400)
        return job_response(lambda: service.start_pair(udid))

    @app.post("/api/encryption")
    async def api_encryption(request: Request):
        data = await json_body(request)
        password, confirm = str(data.get("password", "")), str(data.get("confirm", ""))
        if password != confirm:
            return JSONResponse({"error": "Le due password non coincidono."}, status_code=400)
        return job_response(lambda: service.start_encryption(password))

    @app.post("/api/restore")
    async def api_restore(request: Request):
        data = await json_body(request)
        if str(data.get("confirm", "")).strip().upper() != "RIPRISTINA":
            return JSONResponse({"error": "Per confermare scrivi RIPRISTINA."}, status_code=400)
        target, source, kind = str(data.get("target", "")), str(data.get("source", "")), str(data.get("kind", ""))
        if not target or not source:
            return JSONResponse({"error": "Scegli il backup e il nuovo iPhone."}, status_code=400)
        return job_response(lambda: service.start_restore(target, source, kind, str(data.get("password", ""))))

    @app.post("/api/verify")
    async def api_verify(request: Request):
        data = await json_body(request)
        return job_response(lambda: service.start_verify_password(
            str(data.get("kind", "corrente")), str(data.get("udid", "")), str(data.get("password", ""))))

    @app.post("/api/whatsapp/open")
    async def api_whatsapp_open(request: Request):
        data = await json_body(request)
        return job_response(lambda: service.start_open_whatsapp(
            str(data.get("kind", "corrente")), str(data.get("udid", "")), str(data.get("password", ""))))

    @app.post("/api/whatsapp/close")
    async def api_whatsapp_close():
        service.close_whatsapp()
        return {"ok": True}

    @app.post("/api/device/forget")
    async def api_forget():
        if service.jobs.busy:
            return JSONResponse({"error": "Aspetta che finisca il lavoro in corso."}, status_code=409)
        service.forget_device()
        return {"ok": True}

    return app
