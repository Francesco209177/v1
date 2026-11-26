// Piccolo script senza dipendenze: chiamate API, avanzamento dei lavori, procedure guidate.
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(message, ms = 4500) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add("hidden"), ms);
  }

  async function api(path, body, method) {
    const options = { method: method || (body === undefined ? "GET" : "POST"), headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    let data = {};
    try { data = await response.json(); } catch (e) { /* risposta vuota */ }
    if (response.status === 401) { location.href = "/login"; throw new Error("Sessione scaduta"); }
    if (!response.ok) throw new Error(data.error || "Errore " + response.status);
    return data;
  }

  // --- pannello del lavoro in corso -------------------------------------------------------------
  let lastJobId = null;
  let wasRunning = false;
  let pollTimer = null;
  const finishHandlers = [];

  function onJobFinished(handler) { finishHandlers.push(handler); }

  function renderJob(job) {
    $$("[data-job-panel]").forEach((panel) => {
      if (!job) { panel.classList.remove("visible"); return; }
      panel.classList.add("visible");
      $("[data-job-title]", panel).textContent = job.title;
      const badge = $("[data-job-state]", panel);
      const states = { running: ["In corso", "info"], ok: ["Completato", "ok"], error: ["Errore", "err"] };
      const [label, cls] = states[job.state] || [job.state, ""];
      badge.textContent = label;
      badge.className = "badge " + cls;
      const bar = $("[data-job-bar]", panel);
      const running = job.state === "running";
      bar.classList.toggle("indeterminate", running && job.progress === null);
      bar.firstElementChild.style.width = (job.progress === null ? (running ? 35 : 100) : job.progress) + "%";
      $("[data-job-message]", panel).textContent = job.message || (running ? "Attendi…" : "");
      const lines = $("[data-job-lines]", panel);
      const atBottom = lines.scrollTop + lines.clientHeight >= lines.scrollHeight - 8;
      lines.textContent = (job.lines || []).join("\n");
      if (atBottom) lines.scrollTop = lines.scrollHeight;
      $("[data-job-elapsed]", panel).textContent = formatElapsed(job.elapsed);
    });
    $$("[data-needs-idle]").forEach((btn) => { btn.disabled = !!(job && job.state === "running"); });
  }

  function formatElapsed(seconds) {
    if (!seconds && seconds !== 0) return "";
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return m ? `${m} min ${s} s` : `${s} s`;
  }

  async function poll() {
    clearTimeout(pollTimer);
    let delay = 5000;
    try {
      const status = await api("/api/status");
      const job = status.job || (status.last_job && status.last_job.id === lastJobId ? status.last_job : null);
      renderJob(job);
      if (status.job) {
        lastJobId = status.job.id;
        wasRunning = true;
        delay = 1500;
      } else if (wasRunning) {
        wasRunning = false;
        const finished = status.last_job;
        finishHandlers.forEach((handler) => handler(finished, status));
      }
      $$("[data-next-due]").forEach((el) => { el.textContent = status.next_due_text || "—"; });
    } catch (error) {
      delay = 8000;
    }
    pollTimer = setTimeout(poll, delay);
  }

  async function startJob(path, body, button) {
    if (button) button.disabled = true;
    try {
      const data = await api(path, body || {});
      lastJobId = data.job.id;
      wasRunning = true;
      renderJob(data.job);
      setTimeout(poll, 600);
      return data.job;
    } catch (error) {
      toast(error.message, 7000);
      if (button) button.disabled = false;
      return null;
    }
  }

  // Pulsanti semplici: <button data-start="/api/backup">
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-start]");
    if (!button) return;
    event.preventDefault();
    const confirmText = button.getAttribute("data-confirm");
    if (confirmText && !window.confirm(confirmText)) return;
    startJob(button.getAttribute("data-start"), {}, button);
  });

  // Le pagine con data-reload-on-finish si ricaricano quando il lavoro finisce bene.
  onJobFinished((job) => {
    if (!job) return;
    if (job.state === "ok") {
      toast(job.message || "Fatto");
      if (document.body.hasAttribute("data-reload-on-finish")) setTimeout(() => location.reload(), 1500);
    } else if (job.state === "error") {
      toast(job.message || "Operazione non riuscita", 9000);
    }
  });

  // --- elenco iPhone collegati via USB (associazione e ripristino) -------------------------------
  async function loadUsb(container, onPick) {
    container.innerHTML = '<p class="muted">Cerco iPhone collegati al server…</p>';
    try {
      const data = await api("/api/usb");
      if (!data.devices.length) {
        container.innerHTML = '<div class="alert warn"><strong>Nessun iPhone collegato via USB.</strong>' +
          "Collega il cavo al server, sblocca l'iPhone e tocca di nuovo \"Cerca\".</div>";
        return;
      }
      container.innerHTML = "";
      const list = document.createElement("ul");
      list.className = "list";
      data.devices.forEach((device) => {
        const li = document.createElement("li");
        li.innerHTML = '<div class="row"><div class="avatar">📱</div><div class="grow">' +
          '<div class="title"></div><div class="sub"></div></div><button class="btn small primary" type="button"></button></div>';
        $(".title", li).textContent = device.name || "iPhone";
        $(".sub", li).textContent = [device.ios_version && "iOS " + device.ios_version, device.product_type,
          device.paired ? "già associato" : "non associato", device.error].filter(Boolean).join(" · ");
        const btn = $("button", li);
        btn.textContent = container.getAttribute("data-pick-label") || "Scegli";
        btn.addEventListener("click", () => onPick(device, btn));
        list.appendChild(li);
      });
      container.appendChild(list);
    } catch (error) {
      container.innerHTML = "";
      const alert = document.createElement("div");
      alert.className = "alert err";
      alert.textContent = error.message;
      container.appendChild(alert);
    }
  }

  // Associazione
  const pairList = $("#pair-usb-list");
  if (pairList) {
    const search = () => loadUsb(pairList, (device, btn) => startJob("/api/pair", { udid: device.udid }, btn));
    $("#pair-search").addEventListener("click", search);
  }

  // Cifratura
  const encForm = $("#encryption-form");
  if (encForm) {
    encForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!$("#enc-written").checked) { toast("Conferma di aver scritto la password in un posto sicuro."); return; }
      startJob("/api/encryption", { password: $("#enc-password").value, confirm: $("#enc-confirm").value },
        $("button[type=submit]", encForm));
    });
  }

  // Ripristino
  const restoreForm = $("#restore-form");
  if (restoreForm) {
    const usbBox = $("#restore-usb-list");
    const target = $("#restore-target");
    const targetLabel = $("#restore-target-label");
    $("#restore-search").addEventListener("click", () => loadUsb(usbBox, (device) => {
      target.value = device.udid;
      targetLabel.textContent = `${device.name} (iOS ${device.ios_version || "?"})`;
      toast("Nuovo iPhone scelto: " + device.name);
    }));
    restoreForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const choice = $("input[name=backup]:checked", restoreForm);
      if (!choice) { toast("Scegli il backup da ripristinare."); return; }
      if (!target.value) { toast("Collega il nuovo iPhone e scegli \"Cerca\"."); return; }
      const [kind, udid] = choice.value.split("|");
      startJob("/api/restore", {
        kind, source: udid, target: target.value,
        password: $("#restore-password").value, confirm: $("#restore-confirm").value,
      }, $("button[type=submit]", restoreForm));
    });
  }

  // Verifica password / apertura chat WhatsApp: <form data-backup-form="/api/verify">
  $$("form[data-backup-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const choice = $("[name=backup]:checked", form) || $("[name=backup]", form);
      const [kind, udid] = (choice ? choice.value : "|").split("|");
      startJob(form.getAttribute("data-backup-form"), {
        kind, udid, password: ($("[name=password]", form) || {}).value || "",
      }, $("button[type=submit]", form));
    });
  });

  // Ricerca nelle chat
  const chatSearch = $("#chat-search");
  if (chatSearch) {
    chatSearch.addEventListener("input", () => {
      const q = chatSearch.value.trim().toLowerCase();
      $$("[data-chat-name]").forEach((li) => {
        li.classList.toggle("hidden", q && !li.getAttribute("data-chat-name").toLowerCase().includes(q));
      });
    });
  }

  // Chiusura chat WhatsApp
  const waClose = $("#wa-close");
  if (waClose) {
    waClose.addEventListener("click", async () => {
      await api("/api/whatsapp/close", {});
      location.href = "/whatsapp";
    });
  }

  // Dimentica iPhone
  const forget = $("#forget-device");
  if (forget) {
    forget.addEventListener("click", async () => {
      if (!window.confirm("Togliere l'associazione con questo iPhone? I backup restano sul disco.")) return;
      try { await api("/api/device/forget", {}); location.reload(); } catch (error) { toast(error.message); }
    });
  }

  // Le date ISO negli elementi <time data-local> vengono mostrate nell'ora locale del browser.
  $$("time[data-local]").forEach((el) => {
    const date = new Date(el.getAttribute("datetime"));
    if (!isNaN(date)) el.textContent = date.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  });

  poll();
  window.BackupApp = { api, toast, startJob, onJobFinished };
})();
