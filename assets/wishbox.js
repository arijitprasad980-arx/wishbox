import {
  createOwnerToken,
  createSecretBox,
  createSecretBoxId,
  createSecretBoxKeys,
  decryptSecretMessages,
  encryptSecretMessage,
  getSecretMessages,
  getStoredOwnerCredentials,
  isSecretBoxId,
  storeOwnerCredentials,
  submitSecretMessage,
} from "./secret-box.js?v=secret-box-1";

const DEFAULT_WISH = {
  eyebrow: "",
  name: "",
  intro: "",
  buttonLabel: "Open your wish",
  wishTo: "",
  wishHeadline: "",
  wishNote: "",
  rainStyle: "candles",
  rainImage: "",
  backgroundStyle: "light",
  backgroundColor: "#fffaf2",
  backgroundGradientFrom: "#fef3c7",
  backgroundGradientTo: "#fecdd3",
  backgroundImage: "",
  elements: [],
};

const app = document.querySelector("#app");
const isEditor = /\/edit(?:\.html)?\/?$/.test(location.pathname);
const rainOptions = {
  candles: ["🎂", "✨", "🕯️"],
  cakes: ["🍰", "🧁", "🎂"],
  ribbons: ["🎀", "✨", "🎁"],
  balloons: ["🎈", "🎈", "🎉"],
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `wish-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeWish(value) {
  const wish = { ...DEFAULT_WISH, ...(value && typeof value === "object" ? value : {}) };
  wish.secretBoxId = isSecretBoxId(wish.secretBoxId) ? wish.secretBoxId : "";
  wish.secretBoxPublicKey =
    typeof wish.secretBoxPublicKey === "string" && /^[A-Za-z0-9_-]{200,600}$/.test(wish.secretBoxPublicKey)
      ? wish.secretBoxPublicKey
      : "";
  for (const key of [
    "eyebrow",
    "name",
    "intro",
    "buttonLabel",
    "wishTo",
    "wishHeadline",
    "wishNote",
    "rainImage",
    "backgroundColor",
    "backgroundGradientFrom",
    "backgroundGradientTo",
    "backgroundImage",
  ]) {
    wish[key] = typeof wish[key] === "string" ? wish[key] : DEFAULT_WISH[key];
  }
  if (!["candles", "cakes", "ribbons", "balloons", "custom"].includes(wish.rainStyle)) {
    wish.rainStyle = DEFAULT_WISH.rainStyle;
  }
  if (!["light", "dark", "gradient", "color", "image"].includes(wish.backgroundStyle)) {
    wish.backgroundStyle = DEFAULT_WISH.backgroundStyle;
  }
  wish.elements = Array.isArray(wish.elements)
    ? wish.elements.slice(0, 16).map((item) => ({
        id: typeof item?.id === "string" ? item.id : makeId(),
        kind: ["photo", "name", "note"].includes(item?.kind) ? item.kind : "note",
        src: typeof item?.src === "string" ? item.src : "",
        caption: typeof item?.caption === "string" ? item.caption : "",
        from: typeof item?.from === "string" ? item.from : "",
        text: typeof item?.text === "string" ? item.text : "",
        line: typeof item?.line === "string" ? item.line : "",
        tone: ["white", "butter", "sky", "sage", "coral"].includes(item?.tone)
          ? item.tone
          : "white",
        x: clamp(Number(item?.x) || 50, 2, 95),
        y: clamp(Number(item?.y) || 50, 2, 95),
        rot: clamp(Number(item?.rot) || 0, -12, 12),
      }))
    : [];
  return wish;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function decodeWish() {
  const encoded =
    new URLSearchParams(location.search).get("w") ||
    new URLSearchParams(location.hash.slice(1)).get("w");
  if (!encoded) return { wish: normalizeWish(DEFAULT_WISH), error: "" };
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (char) =>
      char.charCodeAt(0),
    );
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The shared wish is not valid.");
    }
    return { wish: normalizeWish(parsed), error: "" };
  } catch {
    return { wish: normalizeWish(DEFAULT_WISH), error: "This wish link is invalid or incomplete." };
  }
}

function encodeWish(wish) {
  const bytes = new TextEncoder().encode(JSON.stringify(wish));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function siteBase() {
  return new URL("./", location.href);
}

function wishUrl(wish) {
  const url = siteBase();
  url.hash = `w=${encodeWish(wish)}`;
  return url.href;
}

function editorUrl(wish) {
  const url = new URL("edit.html", siteBase());
  if (wish) url.hash = `w=${encodeWish(wish)}`;
  return url.href;
}

function secretInboxUrl(boxId, ownerToken, privateKey) {
  const url = siteBase();
  url.searchParams.set("inbox", boxId);
  url.hash = new URLSearchParams({ owner: ownerToken, key: privateKey }).toString();
  return url.href;
}

function safeImageSource(source) {
  if (typeof source !== "string" || !source.trim()) return "";
  const value = source.trim();
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(value)) return value;
  try {
    const url = new URL(value, location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function image(source, alt, className) {
  const src = safeImageSource(source);
  if (!src) return null;
  const node = element("img", className);
  node.src = src;
  node.alt = alt;
  node.loading = "lazy";
  return node;
}

function createModal(title, bodyNodes) {
  const overlay = element("div", "modal-backdrop");
  overlay.setAttribute("role", "presentation");
  const dialog = element("section", "wish-modal");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", title);
  const badge = element("span", "modal-badge", title);
  const close = element("button", "modal-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => overlay.remove());
  dialog.append(badge, ...bodyNodes, close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(dialog);
  document.body.append(overlay);
  close.focus();
}

function showWish(wish) {
  const nodes = [];
  if (wish.wishTo) nodes.push(element("p", "wish-to", wish.wishTo));
  if (wish.wishHeadline) nodes.push(element("h2", "wish-message", wish.wishHeadline));
  if (wish.wishNote) nodes.push(element("p", "wish-note", wish.wishNote));
  if (!nodes.length) {
    nodes.push(element("p", "wish-note", "Wishing you a day filled with joy, laughter, and all your favorite things."));
  }
  createModal("A wish for you", nodes);
}

function secretMessageBox(boxId, publicKey, preview = false) {
  const box = element("section", "secret-message-box");
  box.setAttribute("aria-label", "Secret message box");
  box.append(
    element("p", "secret-box-eyebrow", "A note, just between us"),
    element("h2", "secret-box-title", "Leave a secret message"),
    element(
      "p",
      "secret-box-description",
      preview
        ? "Your friend can leave a private message here. Read replies using your separate private inbox link."
        : "Only the wish creator can read messages sent here.",
    ),
  );

  const form = element("form", "secret-message-form");
  const input = element("textarea", "secret-message-input");
  input.name = "message";
  input.maxLength = 1000;
  input.required = true;
  input.rows = 4;
  input.placeholder = "Write your secret message…";
  input.setAttribute("aria-label", "Your secret message");
  const submit = element("button", "button button-primary", "Send privately");
  submit.type = "submit";
  const status = element("p", "secret-message-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  form.append(input, submit);
  box.append(form, status);

  if (preview) {
    input.disabled = true;
    submit.disabled = true;
    return box;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) {
      status.textContent = "Write a message before sending.";
      input.focus();
      return;
    }

    submit.disabled = true;
    status.textContent = "Sending your message…";
    try {
      const encryptedMessage = await encryptSecretMessage(publicKey, message);
      await submitSecretMessage(boxId, encryptedMessage);
      form.reset();
      status.textContent = "Your message was sent privately to the wish creator.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Your message could not be sent.";
    } finally {
      submit.disabled = false;
    }
  });
  return box;
}

function renderSecretInbox(container, boxId, ownerToken, privateKey) {
  const page = element("main", "secret-inbox-page");
  const homeLink = element("a", "brand", "Wishbox");
  homeLink.href = siteBase().href;
  const panel = element("section", "secret-inbox-panel");
  const title = element("h1", "secret-inbox-title", "Secret messages");
  const description = element(
    "p",
    "secret-inbox-description",
    "These notes were left for you by someone who received your wish.",
  );
  const status = element("p", "secret-inbox-status", "Opening your private inbox…");
  status.setAttribute("role", "status");
  const messages = element("div", "secret-inbox-messages");
  panel.append(title, description, status, messages);
  page.append(homeLink, panel);
  container.replaceChildren(page);

  if (!isSecretBoxId(boxId)) {
    status.textContent = "This private inbox link is invalid.";
    return;
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(ownerToken) || !/^[A-Za-z0-9_-]{1000,2000}$/.test(privateKey)) {
    status.textContent = "The private inbox link is missing its access key. Use the private link saved by the wish creator.";
    return;
  }

  getSecretMessages(boxId, ownerToken)
    .then((entries) => decryptSecretMessages(entries, privateKey))
    .then((entries) => {
      status.textContent = entries.length ? `${entries.length} secret ${entries.length === 1 ? "message" : "messages"}` : "No messages yet. Check back later.";
      for (const entry of entries) {
        const card = element("article", "secret-inbox-message");
        const date = new Date(entry.created_at);
        const timestamp = element(
          "time",
          "secret-inbox-timestamp",
          Number.isNaN(date.getTime()) ? "Received" : date.toLocaleString(),
        );
        if (!Number.isNaN(date.getTime())) timestamp.dateTime = date.toISOString();
        card.append(timestamp, element("p", "secret-inbox-message-text", entry.message));
        messages.append(card);
      }
    })
    .catch((error) => {
      status.textContent = error instanceof Error ? error.message : "The private inbox could not be opened.";
    });
}

function showElement(item) {
  const nodes = [];
  const photo = item.kind === "photo" ? image(item.src, item.caption || "A birthday memory", "memory-image") : null;
  if (photo) nodes.push(photo);
  if (item.from) nodes.push(element("p", "wish-to", item.from));
  if (item.caption) nodes.push(element("h2", "wish-message", item.caption));
  if (item.text) nodes.push(element("p", "wish-note", item.text));
  if (item.line) nodes.push(element("p", "wish-note", item.line));
  if (!nodes.length) nodes.push(element("p", "wish-note", "A little memory, just for you."));
  createModal("A little memory", nodes);
}

function makeConfettiRain() {
  const layer = element("div", "rain-layer confetti-layer");
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#f46f53", "#ffb24d", "#8db7d2", "#98aa74", "#d78eaa", "#f7d96b"];
  for (let index = 0; index < 120; index += 1) {
    const piece = element("span", "confetti-piece");
    piece.style.left = `${(index * 53 + 7) % 100}%`;
    piece.style.animationDelay = `${(index % 12) * 28}ms`;
    piece.style.setProperty("--drift", `${((index * 13) % 121) - 60}px`);
    piece.style.setProperty("--spin", `${360 + (index % 5) * 180}deg`);
    piece.style.backgroundColor = colors[index % colors.length];
    if (index % 3 === 0) piece.classList.add("confetti-circle");
    layer.append(piece);
  }
  document.body.append(layer);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      layer.remove();
      resolve();
    }, 2400);
  });
}

function makeItRain(wish) {
  const layer = element("div", "rain-layer");
  layer.setAttribute("aria-hidden", "true");
  const custom = wish.rainStyle === "custom" ? safeImageSource(wish.rainImage) : "";
  const icons = rainOptions[wish.rainStyle] || rainOptions.candles;
  for (let index = 0; index < 56; index += 1) {
    const piece = element("span", "rain-piece");
    piece.style.left = `${(index * 37 + 9) % 100}%`;
    piece.style.animationDelay = `${(index % 12) * 70}ms`;
    piece.style.setProperty("--drift", `${(index % 7 - 3) * 24}px`);
    if (wish.rainStyle === "balloons") piece.classList.add("rain-rise");
    if (custom) {
      const picture = image(custom, "", "rain-image");
      if (picture) piece.append(picture);
    } else {
      piece.textContent = icons[index % icons.length];
    }
    layer.append(piece);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 6000);
}

function backgroundStyle(wish, stage) {
  stage.classList.toggle("theme-dark", wish.backgroundStyle === "dark");
  stage.style.backgroundImage = "";
  stage.style.backgroundColor = "";
  if (wish.backgroundStyle === "dark") {
    stage.style.backgroundColor = "#211b20";
  } else if (wish.backgroundStyle === "color") {
    stage.style.backgroundColor = wish.backgroundColor || "#fffaf2";
  } else if (wish.backgroundStyle === "gradient") {
    stage.style.backgroundImage = `linear-gradient(135deg, ${wish.backgroundGradientFrom || "#fef3c7"}, ${wish.backgroundGradientTo || "#fecdd3"})`;
  } else if (wish.backgroundStyle === "image") {
    const src = safeImageSource(wish.backgroundImage);
    if (src) {
      stage.style.backgroundImage = `linear-gradient(rgba(255,250,242,.24), rgba(255,250,242,.35)), url("${src}")`;
      stage.style.backgroundSize = "cover";
      stage.style.backgroundPosition = "center";
    }
  }
}

function memoryPositionBounds(scene, card) {
  const sceneBounds = scene.getBoundingClientRect();
  const cardBounds = card.getBoundingClientRect();
  if (!sceneBounds.width || !sceneBounds.height) return { maxX: 95, maxY: 95 };
  return {
    maxX: Math.max(2, Math.min(95, ((sceneBounds.width - cardBounds.width) / sceneBounds.width) * 100)),
    maxY: Math.max(2, Math.min(95, ((sceneBounds.height - cardBounds.height) / sceneBounds.height) * 100)),
  };
}

function renderWish(container, wish, options = {}) {
  const scene = element("main", `wish-scene${options.preview ? " wish-scene-preview" : ""}`);
  backgroundStyle(wish, scene);
  const glow = element("div", "scene-glow");
  glow.setAttribute("aria-hidden", "true");
  const header = element("header", "scene-header");
  const brand = element("a", "brand");
  brand.href = siteBase().href;
  brand.innerHTML = '<span class="brand-mark" aria-hidden="true">w</span><span>WISHBOX</span>';
  header.append(brand);

  const hero = element("section", "wish-hero");
  if (wish.eyebrow) hero.append(element("p", "wish-eyebrow", wish.eyebrow));
  const heading = element("h1", "wish-title", wish.name || "Your wish");
  const intro = element("p", "wish-intro", wish.intro || (options.preview ? "A little birthday magic, made just for you." : ""));
  hero.append(heading, intro);

  const stage = element("section", "wish-canvas");
  stage.setAttribute("aria-label", "Birthday wish");
  const cake = element("button", "cake-button");
  cake.type = "button";
  cake.setAttribute("aria-label", wish.buttonLabel || "Open your wish");
  const cakeImage = image(new URL("./birthday-cake-lit.svg", import.meta.url).href, "", "cake-art");
  if (cakeImage) cake.append(cakeImage);
  cake.append(element("span", "cake-caption", wish.buttonLabel || "Open your wish"));
  let candleBlownOut = false;
  let cyclePending = false;
  cake.addEventListener("click", () => {
    if (cyclePending) return;
    cyclePending = true;
    cake.disabled = true;
    const confettiAnimation = makeConfettiRain();
    if (!candleBlownOut) {
      cake.classList.add("candle-blowing");
      window.setTimeout(() => {
        if (cakeImage) cakeImage.src = new URL("./birthday-cake-blown.svg", import.meta.url).href;
        cake.classList.remove("candle-blowing");
        cake.classList.add("candle-blown");
        candleBlownOut = true;
      }, 320);
    }
    window.setTimeout(() => {
      showWish(wish);
    }, 1000);
    confettiAnimation.then(() => {
      window.setTimeout(() => {
        if (cakeImage) cakeImage.src = new URL("./birthday-cake-lit.svg", import.meta.url).href;
        cake.classList.remove("candle-blowing", "candle-blown");
        candleBlownOut = false;
        cyclePending = false;
        cake.disabled = false;
      }, 3000);
    });
  });
  stage.append(cake);

  const memoryCards = [];
  for (const [index, item] of wish.elements.entries()) {
    const card = element("button", `floating-memory tone-${item.tone}`);
    card.type = "button";
    card.dataset.elementId = item.id;
    card.style.left = `${item.x}%`;
    card.style.top = `${item.y}%`;
    card.style.setProperty("--tilt", `${item.rot}deg`);
    card.style.setProperty("--memory-delay", `${index * 100}ms`);
    if (item.kind === "photo") {
      const photo = image(item.src, item.caption || "A birthday memory", "memory-thumb");
      if (photo) card.append(photo);
    }
    const label = item.caption || item.text || item.from || "A little memory";
    card.append(element("span", "memory-label", label));
    if (options.preview) {
      card.setAttribute("aria-label", `${label}. Drag to reposition or click to preview.`);
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let dragged = false;
      let suppressClick = false;

      card.addEventListener("pointerdown", (event) => {
        if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = item.x;
        startTop = item.y;
        dragged = false;
        suppressClick = false;
        card.setPointerCapture(pointerId);
      });
      card.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!dragged && Math.hypot(deltaX, deltaY) < 4) return;
        dragged = true;
        event.preventDefault();

        const sceneBounds = scene.getBoundingClientRect();
        if (!sceneBounds.width || !sceneBounds.height) return;
        const limits = memoryPositionBounds(scene, card);
        item.x = Math.round(Math.max(2, Math.min(limits.maxX, startLeft + (deltaX / sceneBounds.width) * 100)));
        item.y = Math.round(Math.max(2, Math.min(limits.maxY, startTop + (deltaY / sceneBounds.height) * 100)));
        card.style.left = `${item.x}%`;
        card.style.top = `${item.y}%`;
        options.onElementDrag?.(item);
      });

      const finishDrag = (event, cancelled = false) => {
        if (event.pointerId !== pointerId) return;
        if (card.hasPointerCapture(pointerId)) card.releasePointerCapture(pointerId);
        pointerId = null;
        if (!dragged) return;
        if (!cancelled) suppressClick = true;
        options.onElementDragEnd?.(item);
        dragged = false;
      };
      card.addEventListener("pointerup", finishDrag);
      card.addEventListener("pointercancel", (event) => finishDrag(event, true));
      card.addEventListener("click", (event) => {
        if (suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick = false;
          return;
        }
        showElement(item);
      });
    } else {
      card.addEventListener("click", () => showElement(item));
    }
    memoryCards.push(card);
  }

  const actions = element("nav", "scene-actions");
  actions.setAttribute("aria-label", "Wish actions");
  const rainButton = element("button", "button button-secondary", "✦ Make it rain");
  rainButton.type = "button";
  rainButton.addEventListener("click", () => makeItRain(wish));
  const copyButton = element("button", "button button-secondary", "Copy link");
  copyButton.type = "button";
  copyButton.addEventListener("click", async () => {
    try {
      await copyText(wishUrl(wish), copyButton);
    } catch {
      copyButton.textContent = "Copy failed";
    }
  });
  const remixLink = element("a", "button button-primary", "Make your own");
  remixLink.href = editorUrl(wish);
  actions.append(rainButton, copyButton, remixLink);

  const privateMessageBox = (wish.secretBoxId && wish.secretBoxPublicKey) || options.preview
    ? secretMessageBox(wish.secretBoxId, wish.secretBoxPublicKey, options.preview)
    : null;
  scene.append(glow, header, hero, stage, ...memoryCards);
  if (privateMessageBox) scene.append(privateMessageBox);
  scene.append(actions);
  container.replaceChildren(scene);
  for (const [index, item] of wish.elements.entries()) {
    const card = memoryCards[index];
    const limits = memoryPositionBounds(scene, card);
    item.x = Math.max(2, Math.min(Math.floor(limits.maxX), Math.round(item.x)));
    item.y = Math.max(2, Math.min(Math.floor(limits.maxY), Math.round(item.y)));
    card.style.left = `${item.x}%`;
    card.style.top = `${item.y}%`;
  }
}

function renderView(error = "") {
  const query = new URLSearchParams(location.search);
  if (query.has("inbox")) {
    const credentials = new URLSearchParams(location.hash.slice(1));
    renderSecretInbox(
      app,
      query.get("inbox"),
      credentials.get("owner") || "",
      credentials.get("key") || "",
    );
    return;
  }
  const { wish, error: decodeError } = decodeWish();
  renderWish(app, wish);
  if (error || decodeError) {
    const notice = element("p", "link-notice", error || decodeError);
    app.append(notice);
  }
}

function defaultElement(kind) {
  const base = {
    id: makeId(),
    kind,
    src: "",
    caption: "",
    from: kind === "name" ? "From you" : "",
    text: kind === "name" ? "Your name here" : "A little note",
    line: "",
    tone: kind === "name" ? "butter" : "sky",
    x: Math.round(18 + Math.random() * 58),
    y: Math.round(18 + Math.random() * 50),
    rot: Math.round(Math.random() * 12 - 6),
  };
  if (kind === "photo") return { ...base, caption: "A favorite memory", tone: "white" };
  return base;
}

function renderEditor() {
  const decoded = decodeWish();
  let wish = decoded.wish;
  app.innerHTML = `
    <div class="editor-shell">
      <header class="editor-topbar">
        <a class="brand" href="${siteBase().href}"><span class="brand-mark" aria-hidden="true">w</span><span>WISHBOX</span></a>
        <a class="button button-secondary topbar-link" data-current-wish href="${siteBase().href}">Back to wish</a>
      </header>
      <div class="editor-layout">
        <aside class="editor-panel" aria-label="Wish editor">
          <div class="panel-heading">
            <p class="eyebrow">Make it yours</p>
            <h1>Build a birthday wish</h1>
            <p>Your wish settings travel with your share link.</p>
          </div>
          ${decoded.error ? '<p class="form-error" role="alert"></p>' : ""}
          <section class="form-section">
            <h2>The front of your wish</h2>
            <label class="field"><span>Small line above</span><input data-field="eyebrow" maxlength="70" placeholder="A little note"></label>
            <label class="field"><span>Big name</span><input data-field="name" maxlength="90" placeholder="Who is it for?"></label>
            <label class="field"><span>Intro line</span><textarea data-field="intro" maxlength="240" rows="2" placeholder="A few words to set the scene"></textarea></label>
            <label class="field"><span>Button words</span><input data-field="buttonLabel" maxlength="40" placeholder="Open your wish"></label>
          </section>
          <section class="form-section">
            <h2>The wish behind the button</h2>
            <label class="field"><span>To</span><input data-field="wishTo" maxlength="90" placeholder="Dear ..."></label>
            <label class="field"><span>The wish</span><textarea data-field="wishHeadline" maxlength="300" rows="3" placeholder="Write the birthday wish"></textarea></label>
            <label class="field"><span>Closing line</span><textarea data-field="wishNote" maxlength="220" rows="2" placeholder="With lots of love"></textarea></label>
          </section>
          <section class="form-section">
            <div class="section-title-row"><h2>Floating memories</h2><span class="field-hint">Up to 16</span></div>
            <div class="add-buttons">
              <button class="button button-secondary small-button" type="button" data-add="photo">＋ Photo</button>
              <button class="button button-secondary small-button" type="button" data-add="name">＋ Name</button>
              <button class="button button-secondary small-button" type="button" data-add="note">＋ Note</button>
            </div>
            <div class="element-list" data-element-list></div>
          </section>
          <section class="form-section">
            <h2>Page background</h2>
            <label class="field"><span>Background style</span>
              <select data-field="backgroundStyle">
                <option value="light">Warm cream</option><option value="dark">Midnight</option>
                <option value="gradient">Gradient</option><option value="color">Custom color</option><option value="image">Photo background</option>
              </select>
            </label>
            <div class="background-options" data-background-options></div>
          </section>
          <section class="form-section">
            <h2>Celebration rain</h2>
            <label class="field"><span>What should fall?</span>
              <select data-field="rainStyle">
                <option value="candles">Candles & confetti</option><option value="cakes">Tiny cakes</option>
                <option value="ribbons">Ribbons</option><option value="balloons">Balloons</option><option value="custom">My image</option>
              </select>
            </label>
            <div class="rain-options" data-rain-options></div>
          </section>
          <div class="editor-actions">
            <button class="button button-primary action-wide" type="button" data-copy>Copy share link</button>
            <button class="button button-secondary action-wide" type="button" data-copy-inbox disabled>Copy private inbox link</button>
            <button class="button button-secondary action-wide" type="button" data-clear>Clear and start over</button>
            <p class="copy-status" data-status role="status" aria-live="polite"></p>
          </div>
          <p class="editor-footnote">Share the wish link with your friend. Keep the separate private inbox link to yourself so you can read their secret messages.</p>
        </aside>
        <section class="preview-column" aria-label="Live preview">
          <div class="preview-heading"><div><p class="eyebrow">Live preview</p><h2>Your page, as they will see it</h2><p class="drag-help">Drag photos, names, and notes anywhere on the page.</p></div><a class="text-link" data-view-link href="${siteBase().href}">Open page ↗</a></div>
          <div class="preview-frame" data-preview></div>
        </section>
      </div>
    </div>`;

  if (decoded.error) app.querySelector(".form-error").textContent = decoded.error;
  const fields = [...app.querySelectorAll("[data-field]")];
  for (const field of fields) field.value = wish[field.dataset.field] ?? "";
  const elementList = app.querySelector("[data-element-list]");
  const backgroundOptions = app.querySelector("[data-background-options]");
  const rainOptionsContainer = app.querySelector("[data-rain-options]");
  const preview = app.querySelector("[data-preview]");
  const status = app.querySelector("[data-status]");
  const inboxCopyButton = app.querySelector("[data-copy-inbox]");
  let privateInboxHref = "";

  function restorePrivateInboxLink() {
    if (!wish.secretBoxId || !wish.secretBoxPublicKey) return;
    try {
      const credentials = getStoredOwnerCredentials(wish.secretBoxId);
      if (!credentials || !/^[A-Za-z0-9_-]{1000,2000}$/.test(credentials.privateKey)) return;
      privateInboxHref = secretInboxUrl(wish.secretBoxId, credentials.ownerToken, credentials.privateKey);
      inboxCopyButton.disabled = false;
    } catch (error) {
      status.textContent = error instanceof Error
        ? `Could not read the saved private inbox key: ${error.message}`
        : "Could not read the saved private inbox key. Use the private inbox link you saved.";
    }
  }

  async function ensureOwnedSecretBox() {
    if (wish.secretBoxId && wish.secretBoxPublicKey) {
      const credentials = getStoredOwnerCredentials(wish.secretBoxId);
      if (credentials && /^[A-Za-z0-9_-]{1000,2000}$/.test(credentials.privateKey)) {
        return { boxId: wish.secretBoxId, ...credentials, storageError: "" };
      }
    }

    const boxId = createSecretBoxId();
    const ownerToken = createOwnerToken();
    const keys = await createSecretBoxKeys();
    await createSecretBox(boxId, ownerToken);
    wish.secretBoxId = boxId;
    wish.secretBoxPublicKey = keys.publicKey;

    let storageError = "";
    try {
      storeOwnerCredentials(boxId, { ownerToken, privateKey: keys.privateKey });
    } catch (error) {
      storageError = error instanceof Error
        ? `The key could not be saved in this browser: ${error.message}`
        : "The key could not be saved in this browser.";
    }
    return { boxId, ownerToken, privateKey: keys.privateKey, storageError };
  }

  function renderConditionalOptions() {
    const style = wish.backgroundStyle;
    backgroundOptions.replaceChildren();
    if (style === "color") {
      backgroundOptions.append(colorField("backgroundColor", "Page color", wish.backgroundColor));
    } else if (style === "gradient") {
      backgroundOptions.append(
        colorField("backgroundGradientFrom", "Gradient from", wish.backgroundGradientFrom),
        colorField("backgroundGradientTo", "Gradient to", wish.backgroundGradientTo),
      );
    } else if (style === "image") {
      backgroundOptions.append(imageField("backgroundImage", "Background photo", wish.backgroundImage));
    }
    rainOptionsContainer.replaceChildren();
    if (wish.rainStyle === "custom") {
      rainOptionsContainer.append(imageField("rainImage", "Rain image", wish.rainImage));
    }
  }

  function updatePositionControl(item, field) {
    const input = [...elementList.querySelectorAll('input[type="range"]')].find(
      (fieldNode) => fieldNode.dataset.id === item.id && fieldNode.dataset.elementField === field,
    );
    if (!input) return;
    const card = [...preview.querySelectorAll(".floating-memory")].find(
      (cardNode) => cardNode.dataset.elementId === item.id,
    );
    const scene = preview.querySelector(".wish-scene");
    const limits = card && scene ? memoryPositionBounds(scene, card) : { maxX: 95, maxY: 95 };
    const max = Math.floor(field === "x" ? limits.maxX : limits.maxY);
    item[field] = Math.max(2, Math.min(max, Math.round(item[field])));
    input.min = "2";
    input.max = String(max);
    input.value = String(item[field]);
    if (card) card.style[field === "x" ? "left" : "top"] = `${item[field]}%`;
    const caption = input.parentElement.querySelector("span");
    if (caption) {
      const label = field === "x" ? "Horizontal position" : "Vertical position";
      caption.textContent = `${label} · ${input.value}`;
    }
  }

  function updateWishLinks() {
    const href = wishUrl(wish);
    app.querySelector("[data-view-link]").href = href;
    app.querySelector("[data-current-wish]").href = href;
  }

  function sync() {
    renderWish(preview, wish, {
      preview: true,
      onElementDrag(item) {
        updatePositionControl(item, "x");
        updatePositionControl(item, "y");
      },
      onElementDragEnd: updateWishLinks,
    });
    for (const item of wish.elements) {
      updatePositionControl(item, "x");
      updatePositionControl(item, "y");
    }
    updateWishLinks();
  }

  function updateConditionalField(event) {
    const field = event.target.closest("[data-field]");
    if (!field) return;
    wish[field.dataset.field] = field.value;
    sync();
  }

  function renderElementList() {
    elementList.replaceChildren();
    if (!wish.elements.length) {
      elementList.append(element("p", "empty-elements", "Add a photo, name or note to make the page feel personal."));
      return;
    }
    for (const item of wish.elements) {
      const card = element("article", "element-card");
      const top = element("div", "element-card-top");
      top.append(element("span", "element-kind", item.kind));
      const remove = element("button", "remove-element", "Remove");
      remove.type = "button";
      remove.dataset.remove = item.id;
      top.append(remove);
      card.append(top);
      if (item.kind === "photo") {
        card.append(textField("Photo URL", "src", item.src, item.id, "https://…"));
        card.append(uploadInput("element", item.id, "Upload photo"));
        card.append(textField("Caption", "caption", item.caption, item.id, "A favorite memory"));
      } else {
        card.append(textField("Small label", "from", item.from, item.id, item.kind === "name" ? "From you" : "A little note"));
        card.append(textField("Text", "text", item.text, item.id, "Write a few words"));
      }
      card.append(textField("Line shown when clicked", "line", item.line, item.id, "Optional"));
      const controls = element("div", "element-controls");
      controls.append(
        selectField("Paper color", "tone", item.tone, item.id, [
          ["white", "White"], ["butter", "Butter"], ["sky", "Sky"], ["sage", "Sage"], ["coral", "Coral"],
        ]),
        rangeField("Horizontal position", "x", item.x, item.id, 2, 95),
        rangeField("Vertical position", "y", item.y, item.id, 2, 95),
        rangeField("Tilt", "rot", item.rot, item.id, -12, 12),
      );
      card.append(controls);
      elementList.append(card);
    }
  }

  for (const field of fields) {
    field.addEventListener("input", () => {
      wish[field.dataset.field] = field.value;
      if (field.dataset.field === "backgroundStyle" || field.dataset.field === "rainStyle") {
        renderConditionalOptions();
      }
      sync();
    });
    field.addEventListener("change", () => {
      wish[field.dataset.field] = field.value;
      if (field.dataset.field === "backgroundStyle" || field.dataset.field === "rainStyle") {
        renderConditionalOptions();
      }
      sync();
    });
  }
  backgroundOptions.addEventListener("input", updateConditionalField);
  backgroundOptions.addEventListener("change", updateConditionalField);
  rainOptionsContainer.addEventListener("input", updateConditionalField);
  rainOptionsContainer.addEventListener("change", updateConditionalField);

  app.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      if (wish.elements.length >= 16) {
        status.textContent = "You can add up to 16 floating memories.";
        return;
      }
      wish.elements.push(defaultElement(button.dataset.add));
      status.textContent = "";
      renderElementList();
      sync();
    });
  });

  elementList.addEventListener("input", (event) => {
    const target = event.target.closest("[data-element-field]");
    if (!target) return;
    const item = wish.elements.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.elementField] = target.dataset.elementField === "x" || target.dataset.elementField === "y" || target.dataset.elementField === "rot"
      ? Number(target.value)
      : target.value;
    sync();
  });
  elementList.addEventListener("change", (event) => {
    const target = event.target.closest("[data-element-field]");
    if (!target) return;
    const item = wish.elements.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.elementField] = target.dataset.elementField === "x" || target.dataset.elementField === "y" || target.dataset.elementField === "rot"
      ? Number(target.value)
      : target.value;
    sync();
  });
  elementList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    wish.elements = wish.elements.filter((item) => item.id !== button.dataset.remove);
    renderElementList();
    sync();
  });

  app.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-upload]");
    const file = input?.files?.[0];
    if (!file) return;
    const target = input.dataset.upload;
    const field = input.dataset.field;
    const itemId = input.dataset.id;
    const maxDimension = target === "backgroundImage" ? 1200 : 700;
    const statusNode = input.parentElement.querySelector("[data-upload-status]");
    if (statusNode) statusNode.textContent = "Preparing image…";
    try {
      const source = await compressImage(file, maxDimension, 72 * 1024);
      if (target === "element") {
        const item = wish.elements.find((entry) => entry.id === itemId);
        if (item) item.src = source;
        const sourceField = [...elementList.querySelectorAll('[data-element-field="src"]')].find(
          (fieldNode) => fieldNode.dataset.id === itemId,
        );
        if (sourceField) {
          sourceField.value = "";
          sourceField.placeholder = "Uploaded image";
        }
      } else {
        wish[field] = source;
        const fieldContainer = field === "rainImage" ? rainOptionsContainer : backgroundOptions;
        const fieldNode = fieldContainer.querySelector(`[data-field="${field}"]`);
        if (fieldNode) {
          fieldNode.value = "";
          fieldNode.placeholder = "Uploaded image";
        }
      }
      if (statusNode) statusNode.textContent = "Image added.";
      sync();
    } catch (error) {
      if (statusNode) statusNode.textContent = error instanceof Error ? error.message : "The image could not be prepared.";
    }
  });

  const shareCopyButton = app.querySelector("[data-copy]");
  shareCopyButton.addEventListener("click", async () => {
    try {
      const { boxId, ownerToken, privateKey, storageError } = await ensureOwnedSecretBox();
      privateInboxHref = secretInboxUrl(boxId, ownerToken, privateKey);
      inboxCopyButton.disabled = false;
      sync();
      try {
        await copyText(wishUrl(wish), shareCopyButton);
      } catch (error) {
        status.textContent = error instanceof Error
          ? `Your wish link is ready, but it could not be copied: ${error.message}`
          : "Your wish link is ready, but it could not be copied.";
        return;
      }
      status.textContent = storageError
        ? `Share link copied. Copy the private inbox link now and save it somewhere safe. ${storageError}`
        : "Share link copied. Copy your private inbox link separately and keep it secret.";
    } catch (error) {
      wish.secretBoxId = "";
      wish.secretBoxPublicKey = "";
      privateInboxHref = "";
      inboxCopyButton.disabled = true;
      sync();
      try {
        await copyText(wishUrl(wish), shareCopyButton);
        const reason = error instanceof Error ? error.message : "Could not create the secret message box.";
        status.textContent = `Wish link copied, but its secret box is unavailable: ${reason}`;
      } catch (copyError) {
        status.textContent = copyError instanceof Error
          ? `Could not create the secret box or copy the wish link: ${copyError.message}`
          : "Could not create the secret box or copy the wish link.";
      }
    }
  });

  inboxCopyButton.addEventListener("click", async () => {
    try {
      if (!privateInboxHref) throw new Error("Create the wish link first to set up its private inbox.");
      await copyText(privateInboxHref, inboxCopyButton);
      status.textContent = "Private inbox link copied. Keep it to yourself; anyone with it can read the replies.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Could not copy the private inbox link.";
    }
  });

  restorePrivateInboxLink();

  app.querySelector("[data-clear]").addEventListener("click", () => {
    wish = normalizeWish(DEFAULT_WISH);
    privateInboxHref = "";
    inboxCopyButton.disabled = true;
    history.replaceState(null, "", location.pathname);
    for (const field of fields) field.value = wish[field.dataset.field] ?? "";
    renderConditionalOptions();
    renderElementList();
    status.textContent = "Your page is clear and ready for a fresh wish.";
    sync();
  });

  renderElementList();
  sync();
}

function colorField(field, label, value) {
  const wrapper = element("label", "field color-field");
  const caption = element("span", "", label);
  const input = element("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#fffaf2";
  input.dataset.field = field;
  wrapper.append(caption, input);
  return wrapper;
}

function imageField(field, label, value) {
  const wrapper = element("div", "image-field");
  wrapper.append(textField(label, field, value, "", "https://…"));
  wrapper.append(uploadInput(field, "", "Choose image"));
  return wrapper;
}

function textField(label, field, value, id, placeholder) {
  const wrapper = element("label", "field compact-field");
  wrapper.append(element("span", "", label));
  const input = element("input");
  input.value = value || "";
  input.placeholder = placeholder || "";
  if (id) {
    input.dataset.elementField = field;
    input.dataset.id = id;
  } else {
    input.dataset.field = field;
  }
  if (field === "src" || field === "backgroundImage" || field === "rainImage") input.type = "url";
  wrapper.append(input);
  return wrapper;
}

function uploadInput(target, id, label) {
  const wrapper = element("label", "upload-button");
  wrapper.append(element("span", "", label));
  const input = element("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.dataset.upload = target;
  if (id) input.dataset.id = id;
  if (target !== "element") input.dataset.field = target;
  wrapper.append(input);
  const status = element("span", "upload-status", "");
  status.dataset.uploadStatus = "";
  wrapper.append(status);
  return wrapper;
}

function selectField(label, field, value, id, options) {
  const wrapper = element("label", "field compact-field");
  wrapper.append(element("span", "", label));
  const select = element("select");
  select.dataset.elementField = field;
  select.dataset.id = id;
  for (const [optionValue, optionLabel] of options) {
    const option = element("option", "", optionLabel);
    option.value = optionValue;
    select.append(option);
  }
  select.value = value;
  wrapper.append(select);
  return wrapper;
}

function rangeField(label, field, value, id, min, max) {
  const wrapper = element("label", "range-field");
  const caption = element("span", "", `${label} · ${value}`);
  const input = element("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.dataset.elementField = field;
  input.dataset.id = id;
  input.addEventListener("input", () => {
    caption.textContent = `${label} · ${input.value}`;
  });
  wrapper.append(caption, input);
  return wrapper;
}

async function compressImage(file, maxDimension, maxBytes) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
  if (!("createImageBitmap" in window)) throw new Error("Image resizing is not supported in this browser.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("The image could not be prepared.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const quality = 0.82 - attempt * 0.07;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= maxBytes) return await blobToDataUrl(blob);
  }
  throw new Error("That image is too detailed. Try a smaller picture.");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The image could not be read."));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function copyText(value, button) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied!";
      window.setTimeout(() => button.textContent = original, 1800);
    }
    return;
  }
  const input = element("textarea", "copy-buffer");
  input.value = value;
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
  if (button) {
    const original = button.textContent;
    button.textContent = "Copied!";
    window.setTimeout(() => button.textContent = original, 1800);
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector(".modal-backdrop")?.remove();
});

if (isEditor) {
  renderEditor();
} else {
  renderView();
}
