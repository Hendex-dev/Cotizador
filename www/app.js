// 1. BASE DE DATOS LOCAL (IndexedDB con Dexie.js - funciona 100% offline)
const db = new Dexie("CotizadorTecnicoDB");
db.version(1).stores({
    piezas: "++id, nombre, precio, foto",
    cotizaciones: "++id, folio, cliente, equipo, pieza, precioPieza, manoObra, total, foto, notas, fecha"
});
db.version(2).stores({
    piezas: "++id, nombre, precio, foto",
    cotizaciones: "++id, folio, cliente, equipo, pieza, precioPieza, manoObra, total, foto, notas, fecha"
}).upgrade(tx => tx.table("cotizaciones").toCollection().modify(cotizacion => {
    if (!Array.isArray(cotizacion.piezas)) {
        cotizacion.piezas = cotizacion.pieza
            ? [{ nombre: cotizacion.pieza, precio: Number(cotizacion.precioPieza) || 0, foto: cotizacion.foto || FOTO_BASE_DEFAULT }]
            : [];
    }
}));

// 2. FOTO BASE POR DEFECTO (SVG embebido en Base64 para no depender de internet)
const FOTO_BASE_DEFAULT = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#eaedff"/>
  <circle cx="150" cy="130" r="55" fill="#d5e3fc"/>
  <path d="M168 112c-7-7-17-9-26-5l14 14-10 10-14-14c-4 9-2 19 5 26 6 6 15 8 23 6l22 22c3 3 8 3 11 0l4-4c3-3 3-8 0-11l-22-22c2-8 0-17-7-22z" fill="#1d4ed8"/>
  <text x="150" y="220" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0037b0" text-anchor="middle">REFACCIÓN GENÉRICA</text>
  <text x="150" y="242" font-family="Arial, sans-serif" font-size="12" fill="#434655" text-anchor="middle">Imagen ilustrativa base</text>
</svg>
`);

let fotoActualCotizacion = FOTO_BASE_DEFAULT;
let fotoActualCatalogo = FOTO_BASE_DEFAULT;
let seleccionandoDesdeCotizacion = false;
let piezasCotizacionActual = [];

function normalizarPiezasCotizacion(cotizacion) {
    if (Array.isArray(cotizacion.piezas)) return cotizacion.piezas;
    return cotizacion.pieza
        ? [{ nombre: cotizacion.pieza, precio: Number(cotizacion.precioPieza) || 0, foto: cotizacion.foto || FOTO_BASE_DEFAULT }]
        : [];
}

function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>'"]/g, caracter => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[caracter]));
}

// Inicialización al cargar la app
window.addEventListener("DOMContentLoaded", async () => {
    await inicializarDatosEjemplo();
    renderizarCotizaciones();
    renderizarCatalogo();
    usarFotoBase("quote");
    usarFotoBase("catalogo");
});

// Cargar 2 piezas base si el catálogo está vacío la primera vez
async function inicializarDatosEjemplo() {
    const conteo = await db.piezas.count();
    if (conteo === 0 && !localStorage.getItem("ejemplos_cargados")) {
        await db.piezas.bulkAdd([
            { nombre: "Termostato Bimetálico Refrigerador", precio: 320, foto: FOTO_BASE_DEFAULT },
            { nombre: "Gas Refrigerante R134a + Carga", precio: 650, foto: FOTO_BASE_DEFAULT }
        ]);
        localStorage.setItem("ejemplos_cargados", "true");
    }
}

// =========================================================
// NAVEGACIÓN ENTRE PANTALLAS
// =========================================================
function navegarA(pantalla, desdeCotizacion = false) {
    seleccionandoDesdeCotizacion = desdeCotizacion;
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(`screen-${pantalla}`).classList.add("active");

    const bottomNav = document.getElementById("bottom-nav");
    if (pantalla === "cotizaciones" || pantalla === "catalogo") {
        bottomNav.style.display = "block";
        actualizarNavActivo(pantalla);
    } else {
        bottomNav.style.display = "none";
    }

    if (pantalla === "cotizaciones") renderizarCotizaciones();
    if (pantalla === "catalogo") renderizarCatalogo();
}

function actualizarNavActivo(tab) {
    const btnCot = document.getElementById("nav-cotizaciones");
    const btnCat = document.getElementById("nav-catalogo");
    if (tab === "cotizaciones") {
        btnCot.className = "flex flex-col items-center justify-center gap-1 min-w-[72px] h-12 text-primary font-bold";
        btnCot.querySelector(".indicator").classList.add("bg-secondary-container");
        btnCat.className = "flex flex-col items-center justify-center gap-1 min-w-[72px] h-12 text-on-surface-variant";
        btnCat.querySelector(".indicator").classList.remove("bg-secondary-container");
    } else {
        btnCat.className = "flex flex-col items-center justify-center gap-1 min-w-[72px] h-12 text-primary font-bold";
        btnCat.querySelector(".indicator").classList.add("bg-secondary-container");
        btnCot.className = "flex flex-col items-center justify-center gap-1 min-w-[72px] h-12 text-on-surface-variant";
        btnCot.querySelector(".indicator").classList.remove("bg-secondary-container");
    }
}

function mostrarToast(mensaje) {
    const toast = document.getElementById("app-toast");
    document.getElementById("app-toast-msg").textContent = mensaje;
    toast.classList.remove("-translate-y-16", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
    setTimeout(() => {
        toast.classList.add("-translate-y-16", "opacity-0");
        toast.classList.remove("translate-y-0", "opacity-100");
    }, 2500);
}

// =========================================================
// MANEJO DE FOTOS (Cámara, Web, Foto Base)
// =========================================================
function seleccionarModoFoto(modo) {
    const btnCam = document.getElementById("btn-foto-camara");
    const btnWeb = document.getElementById("btn-foto-web");
    const btnBase = document.getElementById("btn-foto-base");

    [btnCam, btnWeb, btnBase].forEach(b => {
        b.className = "h-10 rounded-md flex items-center justify-center gap-1 text-on-surface-variant font-label-md";
    });

    if (modo === "camara") {
        btnCam.className = "h-10 rounded-md bg-surface-container-lowest text-primary font-label-md font-bold flex items-center justify-center gap-1 shadow-sm";
        document.getElementById("input-file-camara").click();
    } else if (modo === "web") {
        btnWeb.className = "h-10 rounded-md bg-surface-container-lowest text-primary font-label-md font-bold flex items-center justify-center gap-1 shadow-sm";
        buscarFotoWeb("quote");
    } else {
        btnBase.className = "h-10 rounded-md bg-surface-container-lowest text-primary font-label-md font-bold flex items-center justify-center gap-1 shadow-sm";
        usarFotoBase("quote");
    }
}

function usarFotoBase(destino) {
    if (destino === "quote") {
        fotoActualCotizacion = FOTO_BASE_DEFAULT;
        document.getElementById("quote-photo-preview").src = FOTO_BASE_DEFAULT;
        document.getElementById("quote-photo-badge").textContent = "Foto Base Genérica";
    } else {
        fotoActualCatalogo = FOTO_BASE_DEFAULT;
        document.getElementById("cat-photo-preview").src = FOTO_BASE_DEFAULT;
    }
}

function procesarFotoArchivo(event, destino) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement("canvas");
            const maxDim = 600;
            let w = img.width, h = img.height;
            if (w > h && w > maxDim) { h *= maxDim / w; w = maxDim; }
            else if (h > maxDim) { w *= maxDim / h; h = maxDim; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            const comprimida = canvas.toDataURL("image/jpeg", 0.75);

            if (destino === "quote") {
                fotoActualCotizacion = comprimida;
                document.getElementById("quote-photo-preview").src = comprimida;
                document.getElementById("quote-photo-badge").textContent = "Foto Capturada";
            } else {
                fotoActualCatalogo = comprimida;
                document.getElementById("cat-photo-preview").src = comprimida;
            }
            mostrarToast("Imagen cargada correctamente");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function buscarFotoWeb(destino) {
    const nombrePieza = destino === "quote"
        ? document.getElementById("input-pieza").value
        : document.getElementById("cat-nombre").value;

    const termino = encodeURIComponent((nombrePieza || "refaccion refrigerador") + " repuesto");
    const opcion = confirm(
        "¿Quieres abrir Google Imágenes para buscar y descargar la foto de la pieza?\n\n" +
        "1. Toca Aceptar para buscar en Google.\n" +
        "2. Descarga la imagen en tu celular.\n" +
        "3. Regresa aquí y cárgala desde Cámara/Galería."
    );
    if (opcion) {
        window.open(`https://www.google.com/search?tbm=isch&q=${termino}`, "_blank");
    }
}

// =========================================================
// CATÁLOGO DE PIEZAS (Agregar, Listar, Seleccionar y Borrar)
// =========================================================
function abrirModalPieza() {
    document.getElementById("cat-nombre").value = "";
    document.getElementById("cat-precio").value = "";
    usarFotoBase("catalogo");
    const modal = document.getElementById("modal-nueva-pieza");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function cerrarModalPieza() {
    const modal = document.getElementById("modal-nueva-pieza");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function guardarPiezaCatalogo() {
    const nombre = document.getElementById("cat-nombre").value.trim();
    const precio = parseFloat(document.getElementById("cat-precio").value) || 0;

    if (!nombre) {
        alert("Escribe el nombre de la refacción.");
        return;
    }

    await db.piezas.add({ nombre, precio, foto: fotoActualCatalogo });
    cerrarModalPieza();
    renderizarCatalogo();
    mostrarToast("Pieza guardada en catálogo");
}

async function eliminarPieza(event, id, nombre) {
    event.stopPropagation();
    if (confirm(`¿Seguro que deseas eliminar "${nombre}" del catálogo?`)) {
        await db.piezas.delete(id);
        renderizarCatalogo();
        mostrarToast("Pieza eliminada del catálogo");
    }
}

async function renderizarCatalogo() {
    const grid = document.getElementById("parts-grid");
    const filtro = (document.getElementById("parts-search-input").value || "").toLowerCase();
    const piezas = await db.piezas.toArray();

    const filtradas = piezas.filter(p => p.nombre.toLowerCase().includes(filtro));

    if (filtradas.length === 0) {
        grid.innerHTML = `<p class="col-span-2 text-center text-outline py-8">No hay piezas en el catálogo. Toca "+ Agregar Pieza".</p>`;
        return;
    }

    grid.innerHTML = filtradas.map(p => `
    <article class="flex flex-col justify-between bg-surface-container-lowest rounded-xl p-3 shadow-sm relative">
      <div>
        <div class="relative w-full aspect-square rounded-lg bg-surface-container-low overflow-hidden mb-2">
          <img class="w-full h-full object-cover" src="${p.foto}"/>
          <button onclick="eliminarPieza(event, ${p.id}, '${p.nombre.replace(/'/g, "\\'")}')" aria-label="Eliminar pieza" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center shadow-sm active:scale-90 transition-transform" title="Eliminar pieza">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
        <h2 class="font-label-lg text-on-surface line-clamp-2 leading-snug">${p.nombre}</h2>
      </div>
      <div class="mt-3 pt-2 border-t border-surface-container flex items-center justify-between">
        <div>
          <span class="block font-label-sm text-on-surface-variant">Precio</span>
          <span class="font-headline-sm text-on-surface font-bold">$${p.precio.toFixed(2)}</span>
        </div>
        <button onclick="seleccionarPiezaParaCotizar(${p.id})" class="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center active:scale-90" title="Usar en cotización">
          <span class="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>
    </article>
  `).join("");
}

async function seleccionarPiezaParaCotizar(id) {
    const pieza = await db.piezas.get(id);
    if (!pieza) return;

    if (!seleccionandoDesdeCotizacion) {
        await abrirNuevaCotizacion();
    } else {
        navegarA("nueva");
    }

    piezasCotizacionActual.push({
        nombre: pieza.nombre,
        precio: Number(pieza.precio) || 0,
        foto: pieza.foto || FOTO_BASE_DEFAULT
    });
    renderizarPiezasCotizacion();
    recalcularTotal();
    mostrarToast("Pieza añadida a la cotización");
}

// =========================================================
// COTIZACIONES (Crear, Guardar, Listar, Vista Previa y Borrar)
// =========================================================
async function abrirNuevaCotizacion() {
    const todas = await db.cotizaciones.toArray();
    const ultimoId = todas.length > 0 ? Math.max(...todas.map(c => c.id)) : 0;
    document.getElementById("form-folio").textContent = `#COT-${1001 + ultimoId}`;
    document.getElementById("input-cliente").value = "";
    document.getElementById("input-equipo").value = "";
    document.getElementById("input-pieza").value = "";
    document.getElementById("input-precio-pieza").value = "";
    document.getElementById("input-mano-obra").value = "";
    piezasCotizacionActual = [];
    usarFotoBase("quote");
    renderizarPiezasCotizacion();
    recalcularTotal();
    navegarA("nueva");
}

function renderizarPiezasCotizacion() {
    const lista = document.getElementById("quote-parts-list");
    const contador = document.getElementById("quote-parts-count");
    if (!lista) return;

    contador.textContent = `${piezasCotizacionActual.length} pieza${piezasCotizacionActual.length === 1 ? "" : "s"}`;
    if (piezasCotizacionActual.length === 0) {
        lista.innerHTML = `<p class="text-center text-outline py-3">Aún no has añadido piezas.</p>`;
        return;
    }

    lista.innerHTML = piezasCotizacionActual.map((pieza, indice) => `
        <div class="flex items-center gap-2.5 bg-surface-container-low rounded-lg p-2">
            <img src="${escaparHtml(pieza.foto || FOTO_BASE_DEFAULT)}" class="w-12 h-12 rounded-md object-cover bg-white shrink-0" />
            <div class="flex-1 min-w-0">
                <p class="font-label-md text-on-surface truncate">${escaparHtml(pieza.nombre)}</p>
                <p class="font-body-sm text-on-surface-variant">$${(Number(pieza.precio) || 0).toFixed(2)}</p>
            </div>
            <button onclick="quitarPiezaCotizacion(${indice})" class="w-9 h-9 rounded-lg bg-error-container text-on-error-container flex items-center justify-center shrink-0" aria-label="Quitar pieza">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
    `).join("");
}

function añadirPiezaCotizacion() {
    const nombre = document.getElementById("input-pieza").value.trim();
    const precio = parseFloat(document.getElementById("input-precio-pieza").value) || 0;
    if (!nombre) {
        alert("Escribe el nombre de la pieza antes de añadirla.");
        return;
    }

    piezasCotizacionActual.push({
        nombre,
        precio,
        foto: fotoActualCotizacion || FOTO_BASE_DEFAULT
    });
    document.getElementById("input-pieza").value = "";
    document.getElementById("input-precio-pieza").value = "";
    usarFotoBase("quote");
    renderizarPiezasCotizacion();
    recalcularTotal();
    mostrarToast("Pieza añadida a la cotización");
}

function quitarPiezaCotizacion(indice) {
    piezasCotizacionActual.splice(indice, 1);
    renderizarPiezasCotizacion();
    recalcularTotal();
}

function recalcularTotal() {
    const p = piezasCotizacionActual.reduce((total, pieza) => total + (Number(pieza.precio) || 0), 0);
    const m = parseFloat(document.getElementById("input-mano-obra").value) || 0;
    document.getElementById("calculated-total").textContent = `$${(p + m).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
}

async function guardarYVerPrevia() {
    const cliente = document.getElementById("input-cliente").value.trim();
    const equipo = document.getElementById("input-equipo").value.trim();

    if (!cliente || !equipo) {
        alert("Por favor ingresa al menos el nombre del cliente y el equipo.");
        return;
    }

    const folio = document.getElementById("form-folio").textContent;
    const piezas = piezasCotizacionActual.map(pieza => ({
        nombre: pieza.nombre,
        precio: Number(pieza.precio) || 0,
        foto: pieza.foto || FOTO_BASE_DEFAULT
    }));
    const pieza = piezas[0]?.nombre || "Refacción / Servicio General";
    const precioPieza = piezas.reduce((total, piezaActual) => total + piezaActual.precio, 0);
    const manoObra = parseFloat(document.getElementById("input-mano-obra").value) || 0;
    const total = precioPieza + manoObra;
    const notas = document.getElementById("input-notas").value.trim();
    const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

    const nuevaCot = {
        folio, cliente, equipo, pieza, precioPieza, manoObra, total, piezas,
        foto: piezas[0]?.foto || fotoActualCotizacion || FOTO_BASE_DEFAULT,
        notas, fecha
    };

    const id = await db.cotizaciones.add(nuevaCot);
    verCotizacion(id);
}

async function eliminarCotizacion(event, id, folio, cliente) {
    event.stopPropagation(); // Evita que se abra la vista previa al tocar borrar
    if (confirm(`¿Eliminar la cotización ${folio} de ${cliente}?`)) {
        await db.cotizaciones.delete(id);
        renderizarCotizaciones();
        mostrarToast("Cotización eliminada");
    }
}

async function verCotizacion(id) {
    const c = await db.cotizaciones.get(id);
    if (!c) return;

    const nombreTaller = localStorage.getItem("nombre_taller") || "SERVICIO TÉCNICO ESPECIALIZADO";
    document.getElementById("prev-taller").textContent = nombreTaller;
    document.getElementById("prev-folio").textContent = c.folio;
    document.getElementById("prev-fecha").textContent = `Fecha: ${c.fecha}`;
    document.getElementById("prev-cliente").textContent = c.cliente;
    document.getElementById("prev-equipo").textContent = c.equipo;
    const piezas = normalizarPiezasCotizacion(c);
    const listaPiezas = document.getElementById("prev-piezas");
    listaPiezas.innerHTML = piezas.length > 0
        ? piezas.map(pieza => `
            <div class="p-2.5 rounded-xl bg-[#f2f3ff] flex items-center gap-3">
                <img class="w-16 h-16 rounded-lg object-cover bg-white shrink-0 border border-gray-200" src="${escaparHtml(pieza.foto || FOTO_BASE_DEFAULT)}" />
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-1">
                        <span class="font-label-md font-bold text-[#131b2e] leading-tight">${escaparHtml(pieza.nombre)}</span>
                        <span class="font-label-md font-bold text-[#131b2e] shrink-0">$${(Number(pieza.precio) || 0).toFixed(2)}</span>
                    </div>
                    <span class="font-body-sm text-[#434655]">Refacción / Material</span>
                </div>
            </div>
        `).join("")
        : `<div class="p-2.5 rounded-xl bg-[#f2f3ff] text-[#434655]">Sin piezas de refacción</div>`;
    const manoObra = Number(c.manoObra) || 0;
    const total = Number(c.total) || piezas.reduce((suma, pieza) => suma + (Number(pieza.precio) || 0), 0) + manoObra;
    document.getElementById("prev-mano-obra").textContent = `$${manoObra.toFixed(2)}`;
    document.getElementById("prev-total").textContent = `$${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
    document.getElementById("prev-notas").textContent = c.notas || "Garantía por escrito en el servicio realizado.";

    navegarA("previa");
}

async function renderizarCotizaciones() {
    const lista = document.getElementById("quoteList");
    const filtro = (document.getElementById("quoteSearchInput").value || "").toLowerCase();
    const todas = await db.cotizaciones.reverse().toArray();

    const filtradas = todas.filter(c =>
        c.cliente.toLowerCase().includes(filtro) ||
        c.equipo.toLowerCase().includes(filtro) ||
        c.folio.toLowerCase().includes(filtro)
    );

    // Actualizar KPIs
    const sumaTotal = todas.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    document.getElementById("kpi-count").textContent = `${todas.length} cotizaciones`;
    document.getElementById("kpi-total").textContent = `$${sumaTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;

    if (filtradas.length === 0) {
        lista.innerHTML = `<p class="text-center text-outline py-8">No hay cotizaciones aún. Toca "+ Nueva Cotización".</p>`;
        return;
    }

    lista.innerHTML = filtradas.map(c => `
    <article onclick="verCotizacion(${c.id})" class="w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm active:scale-[0.99] transition-all flex flex-col gap-space-sm cursor-pointer">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="font-label-lg text-on-surface font-bold truncate">${c.cliente}</h2>
          <span class="font-label-sm text-outline">${c.folio} • ${c.fecha}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
           <span class="font-headline-sm text-primary font-bold">$${(Number(c.total) || 0).toFixed(2)}</span>
          <button onclick="eliminarCotizacion(event, ${c.id}, '${c.folio}', '${c.cliente.replace(/'/g, "\\'")}')" aria-label="Eliminar cotización" class="w-8 h-8 rounded-lg bg-error-container text-on-error-container flex items-center justify-center active:scale-90 transition-transform" title="Eliminar cotización">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
      <div class="bg-surface-container-low rounded-lg p-2.5 flex items-center gap-2.5">
         <img src="${c.foto || FOTO_BASE_DEFAULT}" class="w-10 h-10 rounded object-cover bg-white shrink-0"/>
        <div class="min-w-0">
          <p class="font-label-md text-on-surface truncate">${c.equipo}</p>
           <p class="font-body-sm text-on-surface-variant truncate">${normalizarPiezasCotizacion(c).map(pieza => pieza.nombre).join(", ") || "Sin piezas"}</p>
        </div>
      </div>
    </article>
  `).join("");
}

function configurarTaller() {
    const actual = localStorage.getItem("nombre_taller") || "SERVICIO TÉCNICO ESPECIALIZADO";
    const nuevo = prompt("Escribe el nombre de tu negocio o taller para el encabezado:", actual);
    if (nuevo && nuevo.trim()) {
        localStorage.setItem("nombre_taller", nuevo.trim().toUpperCase());
        mostrarToast("Nombre del negocio actualizado");
    }
}

// =========================================================
// EXPORTACIÓN A IMAGEN / PDF Y ENVÍO POR WHATSAPP
// =========================================================
async function exportarYCompartir(tipo) {
    mostrarToast(`Generando ${tipo.toUpperCase()}...`);
    const elemento = document.getElementById("printable-quote");
    const folio = document.getElementById("prev-folio").textContent.replace("#", "");

    try {
        const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: "#ffffff" });

        if (tipo === "imagen") {
            canvas.toBlob(async (blob) => {
                const archivo = new File([blob], `${folio}.png`, { type: "image/png" });
                await compartirArchivoNativo(archivo, `${folio}.png`);
            }, "image/png");
        } else if (tipo === "pdf") {
            const { jsPDF } = window.jspdf;
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF("p", "mm", "a4");
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, "PNG", 10, 10, pdfWidth, pdfHeight);

            const pdfBlob = pdf.output("blob");
            const archivoPdf = new File([pdfBlob], `${folio}.pdf`, { type: "application/pdf" });
            await compartirArchivoNativo(archivoPdf, `${folio}.pdf`);
        }
    } catch (err) {
        console.error(err);
        alert("Hubo un error al generar el archivo.");
    }
}

async function compartirArchivoNativo(archivo, nombreDescarga) {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
            await navigator.share({
                files: [archivo],
                title: "Cotización de Servicio",
                text: "Hola, te comparto la cotización de tu equipo."
            });
        } catch (e) {
            // El usuario canceló el menú compartir
        }
    } else {
        const url = URL.createObjectURL(archivo);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreDescarga;
        a.click();
        mostrarToast("Archivo descargado en tu dispositivo");
    }
}