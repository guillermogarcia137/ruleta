"use strict";
// El DOM es la estructura de la página. Este atajo busca un elemento por su id, por ejemplo $("spin") encuentra el botón de giro.
const $ = (id) => document.getElementById(id);
const defaults = Array.from({ length: 7 }, (_, i) => `Opción ${i + 1}`);
const colors = [
  "#3977e5",
  "#678fdb",
  "#8565c4",
  "#3c9b9d",
  "#d49b48",
  "#bf6985",
  "#526baf",
];
const storageKey = "gg-ruleta-v1";
// Recuperamos la última sesión. JSON.parse transforma la cadena guardada en un objeto; un dato dañado se ignora.
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
} catch {}
let history = Array.isArray(saved.history)
  ? saved.history
      .filter((x) => typeof x?.label === "string" && Number.isFinite(x.time))
      .slice(0, 30)
  : [];
let rotation = 0,
  spinning = false,
  options = [];
$("options").value =
  typeof saved.text === "string" ? saved.text : defaults.join("\n");
$("remove").checked = saved.remove === true;
$("duration").value = ["3000", "5000", "8000"].includes(saved.duration)
  ? saved.duration
  : "5000";
let light = saved.light === true;
// Cambia una clase del body; CSS define los colores de cada modo sin redibujar la rueda.
function theme() {
  document.body.classList.toggle("light", light);
  $("theme").textContent = light ? "◐ Tema oscuro" : "◐ Tema claro";
}
theme();
// Guarda texto, ajustes e historial como JSON en este navegador.
// localStorage conserva cadenas entre visitas; si está bloqueado, la ruleta sigue funcionando durante la sesión.
function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        text: $("options").value,
        remove: $("remove").checked,
        duration: $("duration").value,
        light,
        history,
      }),
    );
  } catch {
    $("status").textContent =
      "El navegador no permite guardar. Puedes seguir usando la ruleta.";
  }
}
// Devuelve un entero aleatorio entre 0 y n - 1 usando Web Crypto.
// Rechazamos la pequeña franja sobrante antes de usar el resto (%), para que todas las opciones tengan igual probabilidad.
function randomIndex(n) {
  const max = 4294967296 - (4294967296 % n),
    a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= max);
  return a[0] % n;
}
// Canvas es una superficie de dibujo. Dividimos el círculo en sectores iguales y giramos sus ángulos con rotation.
// Los cálculos usan radianes: una vuelta completa equivale a 2 × Math.PI.
function draw() {
  const c = $("wheel"),
    ctx = c.getContext("2d"),
    size = 1000,
    center = 500,
    radius = 480;
  ctx.clearRect(0, 0, size, size);
  const entries = options.length ? options : ["Añade tus opciones"];
  const step = (Math.PI * 2) / entries.length;
  entries.forEach((label, i) => {
    const start = rotation + i * step;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + step);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = "#dce8ff33";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + step / 2);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const fontSize = Math.min(
      38,
      Math.max(12, 320 / Math.sqrt(entries.length)),
    );
    ctx.font = `500 ${fontSize}px "Segoe UI", Arial, sans-serif`;
    let text = label;
    while (ctx.measureText(text).width > 320 && text.length > 1)
      text = text.slice(0, -1);
    if (text !== label) text = text.slice(0, -1) + "…";
    ctx.fillText(text, 435, 0);
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#b4cfff55";
  ctx.stroke();
  $("wheel").setAttribute(
    "aria-label",
    `Ruleta con ${options.length} opciones: ${options.join(", ")}`,
  );
}
// Separa las líneas, retira espacios y vacías, y limita la rueda a 100 opciones.
// Actualizar el texto no sortea nada; solo dibuja y guarda la lista.
function update() {
  const all = $("options")
    .value.split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  options = all.slice(0, 100);
  $("count").textContent = options.length;
  $("spin").disabled = $("hub").disabled =
    spinning || options.length < 2 || all.length > 100;
  $("input-hint").textContent =
    all.length > 100
      ? "Hay más de 100 opciones. Reduce la lista para poder girar."
      : "Entre 2 y 100 opciones · Se guardan automáticamente";
  if (!spinning) draw();
  persist();
}
// Crea elementos del DOM para los resultados. textContent muestra los nombres como texto, incluso si contienen etiquetas HTML.
function renderHistory() {
  $("history").replaceChildren();
  history.forEach((entry) => {
    const li = document.createElement("li"),
      name = document.createElement("strong"),
      time = document.createElement("time");
    name.textContent = entry.label;
    time.dateTime = new Date(entry.time).toISOString();
    time.textContent = new Date(entry.time).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    li.append(name, time);
    $("history").append(li);
  });
  $("empty").hidden = history.length > 0;
  $("clear").disabled = history.length === 0;
  $("history-count").textContent = history.length;
}
// Bloquea la edición durante el giro para que no cambien los participantes después de elegir el resultado.
function lock(value) {
  spinning = value;
  for (const id of [
    "options",
    "shuffle",
    "sort",
    "reset",
    "remove",
    "duration",
  ])
    $(id).disabled = value;
  $("spin").disabled = $("hub").disabled = value || options.length < 2;
}
// Elige el ganador antes de animar. El dibujo solo gira hasta el centro del sector elegido.
// La duración y las vueltas extra cambian la animación, pero no la probabilidad de cada opción.
function spin() {
  if (spinning || $("spin").disabled) return;
  const entries = [...options],
    chosen = randomIndex(entries.length),
    step = (2 * Math.PI) / entries.length;
  const start = rotation,
    targetAngle = 2 * Math.PI - (chosen + 0.5) * step;
  const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const delta =
    ((targetAngle - normalized + 2 * Math.PI) % (2 * Math.PI)) +
    2 * Math.PI * (5 + randomIndex(3));
  // Respeta el ajuste de accesibilidad del sistema: con movimiento reducido el resultado aparece con un giro muy breve.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduced ? 150 : Number($("duration").value);
  const began = performance.now();
  lock(true);
  $("status").textContent = "La suerte está en movimiento…";
  // requestAnimationFrame llama a esta función antes del próximo dibujo del navegador.
  // El tiempo transcurrido determina el avance y la fórmula de potencia hace que el giro frene suavemente.
  function animate(now) {
    const t = Math.min(1, (now - began) / duration);
    rotation = start + delta * (1 - Math.pow(1 - t, 4));
    draw();
    if (t < 1) {
      requestAnimationFrame(animate);
      return;
    }
    rotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const label = entries[chosen];
    history.unshift({ label, time: Date.now() });
    history = history.slice(0, 30);
    renderHistory();
    if ($("remove").checked) {
      entries.splice(chosen, 1);
      $("options").value = entries.join("\n");
    }
    lock(false);
    // Keep the finished wheel visible until the result is dismissed.
    if ($("remove").checked) {
      options = entries;
      $("count").textContent = entries.length;
      $("spin").disabled = $("hub").disabled = entries.length < 2;
    }
    persist();
    $("winner").textContent = label;
    $("status").textContent = `Ha salido: ${label}`;
    $("result").showModal();
    $("again").disabled = options.length < 2;
  }
  requestAnimationFrame(animate);
}
// Un evento conecta una acción de la persona con una función. Ambos botones de giro ejecutan exactamente el mismo sorteo.
$("spin").addEventListener("click", spin);
$("hub").addEventListener("click", spin);
$("options").addEventListener("input", update);
$("remove").addEventListener("change", persist);
$("duration").addEventListener("change", persist);
$("theme").addEventListener("click", () => {
  light = !light;
  theme();
  persist();
});
// Mezcla Fisher–Yates: intercambia cada posición con otra elegida al azar, sin eliminar ni duplicar opciones.
$("shuffle").addEventListener("click", () => {
  const a = [...options];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  $("options").value = a.join("\n");
  update();
});
$("sort").addEventListener("click", () => {
  $("options").value = [...options]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    .join("\n");
  update();
});
$("reset").addEventListener("click", () => {
  if (
    confirm(
      "¿Restablecer las opciones de ejemplo? Se sustituirá tu lista actual.",
    )
  ) {
    $("options").value = defaults.join("\n");
    rotation = 0;
    update();
  }
});
$("clear").addEventListener("click", () => {
  if (confirm("¿Vaciar el historial de resultados?")) {
    history = [];
    renderHistory();
    persist();
  }
});
$("close").addEventListener("click", () => $("result").close());
$("again").addEventListener("click", () => {
  $("result").close();
  spin();
});
$("result").addEventListener("close", draw);
// El atajo de espacio no actúa mientras se escribe en un campo o se usa otro control, y evita repetir giros al mantenerlo pulsado.
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !e.repeat &&
    !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(
      document.activeElement.tagName,
    ) &&
    !$("result").open
  ) {
    e.preventDefault();
    spin();
  }
});
// Primera pintura: muestra los datos recuperados y actualiza el estado de los botones al abrir la página.
renderHistory();
update();
