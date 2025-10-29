// Hotfixes:
// 1) Envolver registro de eventos + loadDepartments() en init() al DOM listo → evita errores si el script carga antes que el HTML.
// 2) Eliminar duplicado de findDepartmentImage().
// 3) Optional chaining al registrar eventos (no rompe si falta algún nodo durante pruebas).

const API = "https://api-colombia.com/api/v1";

const state = {
  departments: [],
  filtered: [],
  selected: null,
  cities: [],
  view: "all",
  thumbsOn: false,
  thumbIO: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        ch
      ])
  );

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

const STORAGE_KEY = "colombia-explorer:v4";
function loadStore() {
  try {
    return (
      JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        notas: {},
        munFavs: {},
        deptFavs: [],
        settings: { thumbsOn: false },
      }
    );
  } catch {
    return {
      notas: {},
      munFavs: {},
      deptFavs: [],
      settings: { thumbsOn: false },
    };
  }
}
function saveStore(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
const getNotas = (depId) => loadStore().notas[depId] || [];
const setNotas = (depId, notas) => {
  const s = loadStore();
  s.notas[depId] = notas;
  saveStore(s);
};
const getMunFavs = (depId) => loadStore().munFavs[depId] || [];
const setMunFavs = (depId, favs) => {
  const s = loadStore();
  s.munFavs[depId] = favs;
  saveStore(s);
};
const getDeptFavs = () => {
  const s = loadStore();
  return Array.isArray(s.deptFavs) ? s.deptFavs : [];
};
const setDeptFavs = (arr) => {
  const s = loadStore();
  s.deptFavs = arr;
  saveStore(s);
};
const isDeptFav = (id) => getDeptFavs().includes(Number(id));
const getThumbsPref = () =>
  !!(loadStore().settings && loadStore().settings.thumbsOn);
const setThumbsPref = (val) => {
  const s = loadStore();
  s.settings = s.settings || {};
  s.settings.thumbsOn = !!val;
  saveStore(s);
};

function toggleDeptFav(id) {
  id = Number(id);
  const favs = getDeptFavs();
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(id);
  setDeptFavs(favs);
  updateFavsButton();
  renderList();
}
function updateFavsButton() {
  const btn = byId("btnFavs");
  if (!btn) return;
  const count = getDeptFavs().length;
  btn.textContent = `Favoritos (${count})`;
  btn.classList.toggle("active", state.view === "favorites");
  btn.setAttribute("aria-pressed", String(state.view === "favorites"));
}

async function loadDepartments() {
  try {
    state.thumbsOn = getThumbsPref();
    const chk = byId("thumbs");
    if (chk) chk.checked = state.thumbsOn;
    const data = await getJSON(`${API}/Department`);
    state.departments = data.map((d) => ({
      id: Number(d.id),
      name: d.name,
      description: d.description || "",
    }));
    state.filtered = [...state.departments];
    renderList();
    updateFavsButton();
  } catch (err) {
    console.error(err);
    byId("count") &&
      (byId("count").textContent =
        "Error al cargar departamentos. Intenta más tarde.");
  }
}

function filterAndSort() {
  const q = (byId("q")?.value || "").trim().toLowerCase();
  const sort = byId("sort")?.value || "name-asc";
  let arr = [...state.departments];
  if (state.view === "favorites") {
    const favSet = new Set(getDeptFavs());
    arr = arr.filter((d) => favSet.has(d.id));
  }
  if (q) arr = arr.filter((d) => d.name.toLowerCase().includes(q));
  arr.sort((a, b) =>
    sort === "name-asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
  );
  state.filtered = arr;
  renderList();
}

const imageCache = new Map();
async function getImageFor(name) {
  if (imageCache.has(name)) return imageCache.get(name);
  const url = await findDepartmentImage(name);
  imageCache.set(name, url);
  return url;
}

function setupThumbObserver() {
  if (state.thumbIO) {
    state.thumbIO.disconnect();
    state.thumbIO = null;
  }
  if (!state.thumbsOn) return;
  state.thumbIO = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (img.dataset.loaded === "1") {
          state.thumbIO.unobserve(img);
          continue;
        }
        const name = img.getAttribute("data-dep-name");
        const wrap = img.closest(".thumbWrap");
        try {
          const src = await getImageFor(name);
          img.src = src;
          img.dataset.loaded = "1";
          wrap && wrap.classList.remove("skeleton");
        } catch (_) {}
        state.thumbIO.unobserve(img);
      }
    },
    { rootMargin: "120px" }
  );
  $$(".thumb[data-dep-name]").forEach((img) => state.thumbIO.observe(img));
}

function renderList() {
  const grid = byId("grid");
  if (!grid) return;
  grid.innerHTML = "";
  const titleEl = byId("ttl-list");
  const countEl = byId("count");
  const favMode = state.view === "favorites";
  if (titleEl)
    titleEl.textContent = favMode ? "Departamentos favoritos" : "Departamentos";
  if (countEl)
    countEl.textContent = `${state.filtered.length} ${
      favMode ? "favoritos" : "departamentos"
    }`;
  const frag = document.createDocumentFragment();
  state.filtered.forEach((dep) => {
    const fav = isDeptFav(dep.id);
    const card = el("article", "card");
    if (state.thumbsOn) {
      const t = el("div", "thumbWrap skeleton");
      t.innerHTML = `<img class="thumb" alt="Imagen de ${escapeHTML(
        dep.name
      )}" loading="lazy" data-thumb="true" data-dep-name="${escapeHTML(
        dep.name
      )}" />`;
      card.appendChild(t);
    }
    card.innerHTML += `
<span class="pill">Depto.</span>
<h3>${escapeHTML(dep.name)}</h3>
<p class="chip">ID: ${dep.id}</p>
<div class="actions">
<button class="btn" data-id="${dep.id}">Ver detalle</button>
<button class="btn star ${fav ? "is-active" : ""}" data-fav-id="${
      dep.id
    }" aria-pressed="${fav}">${fav ? "★ Quitar" : "☆ Favorito"}</button>
</div>`;
    frag.appendChild(card);
  });
  grid.appendChild(frag);
  setupThumbObserver();
}

async function showDepartment(id) {
  const detail = byId("detail");
  if (!detail) return;
  detail.innerHTML = `<div class="hero">
<div class="imgWrap" id="depImg"><div class="skeleton" style="position:absolute; inset:0"></div></div>
<div>
<h3 style="margin:0 0 8px">Cargando…</h3>
<p class="muted">Buscando información e imagen.</p>
</div>
</div>`;
  try {
    const dep = await getJSON(`${API}/Department/${id}`);
    state.selected = dep;
    const cities = await getJSON(`${API}/Department/${id}/cities`);
    state.cities = cities;
    const imgURL = await getImageFor(dep.name);
    renderDetail(dep, cities, imgURL);
  } catch (err) {
    console.error(err);
    detail.innerHTML = `<p class="muted">No se pudo cargar el detalle. ${escapeHTML(
      err.message
    )}</p>`;
  }
}

function renderDetail(dep, cities, imgURL) {
  const detail = byId("detail");
  if (!detail) return;
  detail.innerHTML = "";
  const hero = el("div", "hero");
  const imgWrap = el("div", "imgWrap");
  const img = new Image();
  img.alt = `Imagen de ${dep.name}`;
  img.loading = "lazy";
  img.src = imgURL;
  imgWrap.appendChild(img);
  const text = el("div");
  const desc =
    dep.description && dep.description.trim()
      ? dep.description
      : "Sin descripción disponible.";
  const cap = dep.cityCapital
    ? typeof dep.cityCapital === "string"
      ? dep.cityCapital
      : dep.cityCapital.name || ""
    : "";
  const favNow = isDeptFav(dep.id);
  const favBtnTop = el("button", `btn star ${favNow ? "is-active" : ""}`);
  favBtnTop.textContent = favNow
    ? "★ Quitar de favoritos"
    : "☆ Agregar a favoritos";
  favBtnTop.addEventListener("click", () => {
    toggleDeptFav(dep.id);
    const now = isDeptFav(dep.id);
    favBtnTop.textContent = now
      ? "★ Quitar de favoritos"
      : "☆ Agregar a favoritos";
    favBtnTop.classList.toggle("is-active", now);
  });
  text.innerHTML = `
<h2 style="margin:0 0 6px">${escapeHTML(dep.name)}</h2>
<p class="muted" style="margin-top:6px">${escapeHTML(desc)}</p>
<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
<span class="pill">ID: ${dep.id}</span>
${cap ? `<span class="pill">Capital: ${escapeHTML(cap)}</span>` : ""}
${
  dep.population
    ? `<span class="pill">Población: ${Number(dep.population).toLocaleString(
        "es-CO"
      )}</span>`
    : ""
}
${
  dep.surface
    ? `<span class="pill">Área: ${Number(dep.surface).toLocaleString(
        "es-CO"
      )} km²</span>`
    : ""
}
</div>`;
  hero.appendChild(imgWrap);
  hero.appendChild(text);
  const topRow = el("div");
  topRow.style.margin = "8px 0 0";
  topRow.appendChild(favBtnTop);
  const citiesBox = el("div");
  citiesBox.innerHTML = `<h3 style="margin:14px 0 8px">🏘️ Municipios (${cities.length})</h3>`;
  const ul = el("div", "list");
  cities.forEach((c) => {
    const li = el("div", "li");
    li.textContent = c.name;
    ul.appendChild(li);
  });
  citiesBox.appendChild(ul);
  const crud = renderCRUD(dep.id);
  detail.appendChild(hero);
  detail.appendChild(topRow);
  detail.appendChild(citiesBox);
  detail.appendChild(crud);
}

async function findDepartmentImage(name) {
  const queries = [
    `Departamento de ${name} (Colombia)`,
    `${name} (departamento de Colombia)`,
    `Departamento del ${name} (Colombia)`,
    `${name} Colombia departamento`,
  ];
  for (const q of queries) {
    const url = new URL("https://es.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      origin: "*",
      action: "query",
      format: "json",
      generator: "search",
      gsrlimit: "1",
      gsrsearch: q,
      prop: "pageimages",
      piprop: "thumbnail|original",
      pithumbsize: "1280",
    }).toString();
    try {
      const data = await getJSON(url);
      if (data.query && data.query.pages) {
        const page = Object.values(data.query.pages)[0];
        const src =
          (page.thumbnail && page.thumbnail.source) ||
          (page.original && page.original.source);
        if (src) return src;
      }
    } catch (_) {}
  }
  return "https://upload.wikimedia.org/wikipedia/commons/2/21/Colombia_departments_blank_map.svg";
}

function renderCRUD(depId) {
  const wrap = el("div", "panel crud");
  const inner = el("div", "panel-bd");
  wrap.appendChild(el("div", "panel-hd")).innerHTML =
    "<h2>📝 Tus notas & favoritos (local)</h2>";
  const form = el("form");
  form.innerHTML = `
<input type="hidden" name="id" />
<input class="input" name="titulo" placeholder="Título de la nota" required />
<button class="btn" type="submit">Guardar nota</button>
<textarea class="input" name="texto" placeholder="Describe tu nota…" required></textarea>
`;
  inner.appendChild(form);
  const notasBox = el("div");
  const notasTtl = el("h3");
  notasTtl.textContent = "Notas guardadas";
  const notasList = el("div", "list");
  notasBox.appendChild(notasTtl);
  notasBox.appendChild(notasList);
  const favBox = el("div");
  const favTtl = el("h3");
  favTtl.textContent = "⭐ Municipios favoritos";
  const favList = el("div", "list");
  favBox.appendChild(favTtl);
  favBox.appendChild(favList);
  inner.appendChild(notasBox);
  inner.appendChild(favBox);
  wrap.appendChild(inner);
  updateNotasView();
  updateMunFavsView();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const id = fd.get("id");
    const titulo = String(fd.get("titulo") || "").trim();
    const texto = String(fd.get("texto") || "").trim();
    if (!titulo || !texto) return;
    const notas = getNotas(depId);
    if (id) {
      const idx = notas.findIndex((n) => n.id === id);
      if (idx >= 0) {
        notas[idx] = {
          ...notas[idx],
          titulo,
          texto,
          fecha: new Date().toISOString(),
        };
      }
    } else {
      notas.push({
        id: crypto.randomUUID(),
        titulo,
        texto,
        fecha: new Date().toISOString(),
      });
    }
    setNotas(depId, notas);
    form.reset();
    form.querySelector("[type=submit]").textContent = "Guardar nota";
    updateNotasView();
  });
  function updateNotasView() {
    notasList.innerHTML = "";
    const notas = getNotas(depId);
    if (!notas.length) {
      notasList.innerHTML =
        '<div class="li muted">Aún no tienes notas 🗒️</div>';
      return;
    }
    notas.forEach((n) => {
      const item = el("div", "note");
      item.innerHTML = `
<h4>${escapeHTML(n.titulo)}</h4>
<small class="muted">${new Date(n.fecha).toLocaleString("es-CO")}</small>
<p>${escapeHTML(n.texto)}</p>
<div class="row">
<button class="btn" data-edit="${n.id}">Editar</button>
<button class="btn ghost" data-del="${n.id}">Eliminar</button>
</div>`;
      notasList.appendChild(item);
    });
  }
  notasList.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    const notas = getNotas(depId);
    if (editBtn) {
      const id = editBtn.getAttribute("data-edit");
      const nota = notas.find((n) => n.id === id);
      if (nota) {
        form.querySelector("[name=id]").value = nota.id;
        form.querySelector("[name=titulo]").value = nota.titulo;
        form.querySelector("[name=texto]").value = nota.texto;
        form.querySelector("[type=submit]").textContent = "Actualizar nota";
      }
    }
    if (delBtn) {
      const id = delBtn.getAttribute("data-del");
      const next = notas.filter((n) => n.id !== id);
      setNotas(depId, next);
      updateNotasView();
    }
  });
  function updateMunFavsView() {
    favList.innerHTML = "";
    const favs = getMunFavs(depId);
    if (!favs.length) {
      favList.innerHTML =
        '<div class="li muted">Sin municipios favoritos ✨</div>';
      return;
    }
    favs.forEach((name, idx) => {
      const row = el("div", "li");
      row.innerHTML = `
<div style="display:flex; justify-content:space-between; align-items:center; gap:12px">
<strong>${escapeHTML(name)}</strong>
<span>
<button class="btn" data-fav-edit="${idx}">Renombrar</button>
<button class="btn ghost" data-fav-del="${idx}">Quitar</button>
</span>
</div>`;
      favList.appendChild(row);
    });
  }
  favList.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-fav-edit]");
    const del = e.target.closest("[data-fav-del]");
    const favs = getMunFavs(depId);
    if (edit) {
      const idx = Number(edit.getAttribute("data-fav-edit"));
      const nuevo = prompt(
        "Nuevo nombre para el municipio favorito:",
        favs[idx]
      );
      if (nuevo && nuevo.trim()) {
        favs[idx] = nuevo.trim();
        setMunFavs(depId, favs);
        updateMunFavsView();
      }
    }
    if (del) {
      const idx = Number(del.getAttribute("data-fav-del"));
      favs.splice(idx, 1);
      setMunFavs(depId, favs);
      updateMunFavsView();
    }
  });
  return wrap;
}

// ==========
// INIT seguro
// ==========
function init() {
  byId("q")?.addEventListener("input", filterAndSort);
  byId("sort")?.addEventListener("change", filterAndSort);
  byId("reset")?.addEventListener("click", () => {
    if (byId("q")) byId("q").value = "";
    if (byId("sort")) byId("sort").value = "name-asc";
    state.view = "all";
    filterAndSort();
    updateFavsButton();
  });
  byId("btnFavs")?.addEventListener("click", () => {
    state.view = state.view === "favorites" ? "all" : "favorites";
    filterAndSort();
    updateFavsButton();
  });
  byId("thumbs")?.addEventListener("change", (e) => {
    state.thumbsOn = e.target.checked;
    setThumbsPref(state.thumbsOn);
    filterAndSort();
  });
  byId("grid")?.addEventListener("click", (e) => {
    const favBtn = e.target.closest("[data-fav-id]");
    if (favBtn) {
      toggleDeptFav(favBtn.getAttribute("data-fav-id"));
      return;
    }
    const btn = e.target.closest("[data-id]");
    if (btn) showDepartment(btn.getAttribute("data-id"));
  });
  loadDepartments();
}
if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
