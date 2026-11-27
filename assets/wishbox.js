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
        x: clamp(Number(item?.x) || 50, 5, 85),
        y: clamp(Number(item?.y) || 50, 10, 78),
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
  for (let index = 0; index < 64; index += 1) {
    const piece = element("span", "confetti-piece");
    piece.style.left = `${(index * 53 + 7) % 100}%`;
    piece.style.animationDelay = `${(index % 8) * 14}ms`;
    piece.style.setProperty("--drift", `${((index * 13) % 121) - 60}px`);
    piece.style.setProperty("--spin", `${360 + (index % 5) * 180}deg`);
    piece.style.backgroundColor = colors[index % colors.length];
    if (index % 3 === 0) piece.classList.add("confetti-circle");
    layer.append(piece);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 1300);
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
  let revealPending = false;
  cake.addEventListener("click", () => {
    if (revealPending) return;
    revealPending = true;
    cake.disabled = true;
    makeConfettiRain();
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
      revealPending = false;
      cake.disabled = false;
    }, 1000);
  });
  stage.append(cake);

  for (const [index, item] of wish.elements.entries()) {
    const card = element("button", `floating-memory tone-${item.tone}`);
    card.type = "button";
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
    card.addEventListener("click", () => showElement(item));
    stage.append(card);
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

  scene.append(glow, header, hero, stage, actions);
  container.replaceChildren(scene);
}

function renderView(error = "") {
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
            <p>Every little detail travels with your share link.</p>
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
            <button class="button button-secondary action-wide" type="button" data-clear>Clear and start over</button>
            <p class="copy-status" data-status role="status" aria-live="polite"></p>
          </div>
          <p class="editor-footnote">Anyone with your link can open the wish and remix their own version.</p>
        </aside>
        <section class="preview-column" aria-label="Live preview">
          <div class="preview-heading"><div><p class="eyebrow">Live preview</p><h2>Your page, as they will see it</h2></div><a class="text-link" data-view-link href="${siteBase().href}">Open page ↗</a></div>
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

  function sync() {
    renderWish(preview, wish, { preview: true });
    app.querySelector("[data-view-link]").href = wishUrl(wish);
    app.querySelector("[data-current-wish]").href = wishUrl(wish);
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
        rangeField("Horizontal position", "x", item.x, item.id, 5, 85),
        rangeField("Vertical position", "y", item.y, item.id, 10, 78),
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

  app.querySelector("[data-copy]").addEventListener("click", async (event) => {
    try {
      await copyText(wishUrl(wish));
      status.textContent = "Share link copied. Send it to your friend!";
    } catch {
      status.textContent = "Could not copy automatically. Use the Open page link, then copy its address.";
    }
  });

  app.querySelector("[data-clear]").addEventListener("click", () => {
    wish = normalizeWish(DEFAULT_WISH);
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
