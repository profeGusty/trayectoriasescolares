let alumnoSeleccionadoId = null;

// Clave de localStorage compartida por el control de inactividad y por la
// protección de historial de navegación (ver más abajo). Se declara acá arriba
// de todo porque ambos mecanismos la necesitan.
const CLAVE_ULTIMA_ACTIVIDAD = "panel_ultima_actividad";

// PROTECCIÓN CONTRA VOLVER AL PANEL CON ATRÁS/ADELANTE DEL NAVEGADOR
//
// Por diseño, cualquier sitio con sesión (Gmail, este panel, etc.) deja pasar a
// alguien con un token de sesión todavía válido, sin importar cómo haya llegado
// a la página -- eso NO es un bug. Pero en una computadora COMPARTIDA de la
// escuela, no cerrar sesión y que alcance con apretar "atrás"/"adelante" para
// volver a entrar es un riesgo real. Por eso acá se decidió algo más estricto
// que el comportamiento típico de la web: usar atrás/adelante para volver a esta
// página SIEMPRE exige loguearse de nuevo, aunque la sesión de Supabase siga
// siendo válida.
//
// Esto requiere cubrir DOS mecanismos distintos del navegador:
//
// 1) "bfcache": al usar atrás/adelante, muchos navegadores no vuelven a cargar
//    la página ni disparan "DOMContentLoaded" -- la restauran tal cual estaba en
//    memoria. Lo detectamos con el evento "pageshow" (persisted:true) y, en vez
//    de solo recargar, primero cerramos la sesión activa y recién ahí recargamos
//    -- así el control de acceso de más abajo no encuentra ninguna sesión válida.
//
// 2) Navegación atrás/adelante SIN bfcache (el navegador sí vuelve a pedir la
//    página al servidor): acá "pageshow" no alcanza porque persisted da false.
//    Lo detectamos con la Navigation Timing API (performance.getEntriesByType
//    ("navigation")[0].type === "back_forward") y forzamos el mismo cierre de
//    sesión antes de que el control de acceso llegue a correr.
function esNavegacionAtrasAdelante() {
    try {
        const entradas = performance.getEntriesByType("navigation");
        if (entradas.length > 0) return entradas[0].type === "back_forward";
    } catch (e) { /* Navigation Timing API no disponible */ }
    // Fallback para navegadores muy viejos que no soportan la API moderna
    if (window.performance && performance.navigation) {
        return performance.navigation.type === performance.navigation.TYPE_BACK_FORWARD;
    }
    return false;
}

async function forzarNuevoLoginPorHistorialNavegador() {
    await window.supabaseCliente.auth.signOut();
    localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
    window.location.href = "index.html?motivo=navegacion";
}

window.addEventListener("pageshow", async (event) => {
    if (event.persisted) {
        await window.supabaseCliente.auth.signOut();
        localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
        window.location.reload();
    }
});

// CIERRE DE SESIÓN AUTOMÁTICO POR INACTIVIDAD
// Pensado para compus compartidas de la escuela: si nadie toca nada durante
// TIEMPO_INACTIVIDAD_MS, se cierra la sesión sola aunque el token de Supabase
// siga siendo técnicamente válido.
const TIEMPO_INACTIVIDAD_MS = 20 * 60 * 1000; // 20 minutos

// Guarda en localStorage el momento de la última actividad detectada.
// Usamos localStorage (no una variable en memoria) para que el chequeo funcione
// incluso si la pestaña se quedó en segundo plano o se volvió a abrir más tarde.
function registrarActividad() {
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, Date.now().toString());
}

async function cerrarSesionPorInactividad() {
    await window.supabaseCliente.auth.signOut();
    localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
    window.location.href = "index.html?motivo=inactividad";
}

// Arranca la detección de actividad y el chequeo periódico de inactividad.
// Se llama una sola vez, ya confirmado que hay una sesión válida.
function iniciarControlInactividad() {
    registrarActividad();

    // Throttle manual: no escribimos en localStorage más de una vez cada 5s,
    // para no generar cientos de escrituras por segundo con el mousemove.
    let ultimoRegistro = 0;
    const eventosDeActividad = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    eventosDeActividad.forEach(ev => {
        document.addEventListener(ev, () => {
            const ahora = Date.now();
            if (ahora - ultimoRegistro > 5000) {
                ultimoRegistro = ahora;
                registrarActividad();
            }
        }, { passive: true });
    });

    // Chequeamos cada 30 segundos si ya pasó el tiempo límite sin actividad
    setInterval(() => {
        const ultima = parseInt(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) || "0", 10);
        if (Date.now() - ultima > TIEMPO_INACTIVIDAD_MS) {
            cerrarSesionPorInactividad();
        }
    }, 30000);
}

// Escapa caracteres especiales de HTML para poder insertar datos de la base
// dentro de innerHTML / atributos sin riesgo de romper el marcado o exponer a XSS
function escapeHTML(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// RANGOS PRE-ESTABLECIDOS POR LA INSTITUCIÓN
const LISTA_CURSOS = [
    "1ro 1ra", "1ro 2da", "1ro 3ra", "2do 1ra", "2do 2da", "2do 3ra", 
    "3ro 1ra", "3ro 2da", "3ro 3ra", "4to 1ra", "4to 2da", "4to 3ra", 
    "5to 1ra", "5to 2da", "5to 3ra", "6to 1ra", "6to 2da", "6to 3ra", 
    "7mo 1ra", "7mo 2da", "7mo 3ra"
];

const LISTA_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const LISTA_HORARIOS = [
    "7:30 a 9:30", "9:50 a 11:50", "12:50 a 14:50", 
    "15:10 a 17:10", "17:30 a 19:30", "19:40 a 21:40"
];

document.addEventListener("DOMContentLoaded", async () => {
    // 0. Si se llegó a esta página con el botón atrás/adelante del navegador
    // (sin pasar por el bfcache, que ya se maneja aparte en el listener de
    // "pageshow" de más arriba), forzamos un nuevo login aunque la sesión
    // siga siendo técnicamente válida. Ver la explicación completa al principio
    // del archivo.
    if (esNavegacionAtrasAdelante()) {
        await forzarNuevoLoginPorHistorialNavegador();
        return;
    }

    // 1. CONTROL DE ACCESO
    const { data: { session } } = await window.supabaseCliente.auth.getSession();
    if (!session) {
        alert("Acceso denegado.");
        window.location.href = "index.html";
        return;
    }

    // Aunque el token siga siendo válido, si ya pasó demasiado tiempo desde la
    // última actividad registrada (por ejemplo: se dejó la pestaña abierta y
    // nadie la tocó, o se volvió a abrir el navegador mucho después), cerramos
    // la sesión en vez de dejar entrar directo.
    const ultimaActividad = parseInt(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) || "0", 10);
    if (ultimaActividad && (Date.now() - ultimaActividad > TIEMPO_INACTIVIDAD_MS)) {
        await cerrarSesionPorInactividad();
        return;
    }

    iniciarControlInactividad();

    // NUEVO: Ejecutar búsqueda en tiempo real cada vez que la preceptora cambie el curso en el desplegable
    document.getElementById("select-filtro-curso").addEventListener("change", ejecutarBusqueda);

    document.getElementById("info-usuario").textContent = `Conectado como: ${session.user.email}`;

    // 2. INYECTAR OPCIONES PREESTABLECIDAS EN LOS SELECTS DE LA PÁGINA
    inicializarSelectoresGlobales();

    // 3. BUSCADOR
    document.getElementById("btn-buscar").addEventListener("click", ejecutarBusqueda);
    document.getElementById("input-busqueda").addEventListener("keypress", (e) => { if (e.key === "Enter") ejecutarBusqueda(); });
    document.getElementById("btn-limpiar-busqueda").addEventListener("click", limpiarBusquedaEstudiantes);

    // 4. MODAL MATERIAS Y MENÚ DESPLEGABLE NUEVO ALUMNO
    configurarComponentesInterfaz();

    // 5. CERRAR SESIÓN
    document.getElementById("btn-cerrar-sesion").addEventListener("click", async () => {
        await window.supabaseCliente.auth.signOut();
        localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
        window.location.href = "index.html";
    });
});

async function inicializarCursosCalificaciones() {
    const selectCurso = document.getElementById("notas-select-curso");
    
    try {
        // Agrupamos por la columna 'curso' de la tabla materias para obtener los existentes
        const { data, error } = await window.supabaseCliente
            .from('materias')
            .select('curso');

        if (error) throw error;

        // Filtramos valores duplicados o vacíos en JavaScript
        const cursosUnicos = [...new Set(data.map(m => m.curso))].filter(Boolean).sort();

        let opciones = '<option value="">-- Elegir Curso --</option>';
        cursosUnicos.forEach(curso => {
            opciones += `<option value="${curso}">${curso}</option>`;
        });
        
        selectCurso.innerHTML = opciones;

    } catch (err) {
        console.error("Error al cargar cursos únicos:", err.message);
        selectCurso.innerHTML = '<option value="">-- Error al cargar --</option>';
    }
}

// Inyección limpia de rangos fijos de la escuela
function inicializarSelectoresGlobales() {
    // Cursos
    document.querySelectorAll(".select-curso-global").forEach(select => {
        select.innerHTML = LISTA_CURSOS.map(c => `<option value="${c}">${c}</option>`).join('');
    });

    // Días (Bloque 1)
    document.querySelectorAll("#int-dia, #rec-dia").forEach(select => {
        select.innerHTML = LISTA_DIAS.map(d => `<option value="${d}">${d}</option>`).join('');
    });

    // Días (Bloque 2 Opcional)
    document.querySelectorAll("#int-dia-2, #rec-dia-2").forEach(select => {
        select.innerHTML = `<option value="">-- No requiere segundo día --</option>` + 
                           LISTA_DIAS.map(d => `<option value="${d}">${d}</option>`).join('');
    });

    // Horarios (Bloque 1)
    document.querySelectorAll("#int-horario, #rec-horario").forEach(select => {
        select.innerHTML = LISTA_HORARIOS.map(h => `<option value="${h}">${h}</option>`).join('');
    });

    // Horarios (Bloque 2 Opcional)
    document.querySelectorAll("#int-horario-2, #rec-horario-2").forEach(select => {
        select.innerHTML = `<option value="">-- No requiere segundo horario --</option>` + 
                           LISTA_HORARIOS.map(h => `<option value="${h}">${h}</option>`).join('');
    });
}

// Igual que con "Cargar Notas por Materia": mientras se está registrando un
// estudiante nuevo no hace falta ver el buscador, así que lo ocultamos; al
// cancelar (o al terminar de guardar) lo volvemos a mostrar.
// (Están a nivel global -- no anidadas dentro de configurarComponentesInterfaz --
// para que mostrarPanelCargaNotas/cerrarPanelCargaNotas, más abajo, puedan
// llamarlas y así los dos paneles nunca queden abiertos al mismo tiempo.)
function mostrarFormularioNuevoAlumno() {
    // Si el panel de "Cargar Notas por Materia" está abierto, lo cerramos primero
    // para que nunca queden los dos formularios abiertos a la vez y confundan al usuario.
    cerrarPanelCargaNotas();

    document.getElementById("seccion-nuevo-alumno").classList.remove("oculto");
    const seccionBuscador = document.getElementById("seccion-buscador-estudiantes");
    if (seccionBuscador) seccionBuscador.style.display = "none";
    document.getElementById("seccion-nuevo-alumno").scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormularioNuevoAlumno() {
    document.getElementById("seccion-nuevo-alumno").classList.add("oculto");
    document.getElementById("form-nuevo-estudiante").reset();
    const seccionBuscador = document.getElementById("seccion-buscador-estudiantes");
    if (seccionBuscador) seccionBuscador.style.display = "block";
}

function configurarComponentesInterfaz() {
    // Toggle Formulario Alumno
    const btnToggleAlumno = document.getElementById("btn-toggle-nuevo-alumno");
    const seccionAlumno = document.getElementById("seccion-nuevo-alumno");

    btnToggleAlumno.addEventListener("click", () => {
        if (seccionAlumno.classList.contains("oculto")) {
            mostrarFormularioNuevoAlumno();
        } else {
            cerrarFormularioNuevoAlumno();
        }
    });

    const btnCancelarNuevoAlumno = document.getElementById("btn-cancelar-nuevo-alumno");
    if (btnCancelarNuevoAlumno) {
        btnCancelarNuevoAlumno.addEventListener("click", cerrarFormularioNuevoAlumno);
    } else {
        // Si esto aparece en la consola, significa que panel.html no tiene el botón
        // #btn-cancelar-nuevo-alumno -- probablemente estás usando una versión vieja
        // de panel.html junto con esta versión más nueva de panel.js. Reemplazá
        // panel.html por el archivo actualizado.
        console.warn("No se encontró #btn-cancelar-nuevo-alumno en el HTML. ¿panel.html está actualizado?");
    }

    // Formulario Nuevo Estudiante (Guardar, avisar y CERRAR de inmediato)
    document.getElementById("form-nuevo-estudiante").addEventListener("submit", async (e) => {
        e.preventDefault();
        const apellido = document.getElementById("new-apellido").value.trim();
        const nombre = document.getElementById("new-nombre").value.trim();
        const dni = document.getElementById("new-dni").value.trim();
        const curso = document.getElementById("new-curso").value;

        const { data: nuevoEst, error } = await window.supabaseCliente
            .from('estudiantes')
            .insert([{ apellido, nombre, dni, curso_actual: curso }]).select().single();

        if (error) {
            alert("Error al guardar: " + (error.code === "23505" ? "El DNI ya existe." : error.message));
            return;
        }

        // Auto-creación de boletín estructural según el curso asignado
        const { data: mats } = await window.supabaseCliente.from('materias').select('id').eq('curso', curso);
        if (mats && mats.length > 0) {
            const filas = mats.map(m => ({ estudiante_id: nuevoEst.id, materia_id: m.id, primer_informe: "" }));
            await window.supabaseCliente.from('boletines').insert(filas);
        }

        alert(`¡Estudiante ${apellido}, ${nombre} agregado con éxito!`);
        cerrarFormularioNuevoAlumno(); // Resetea el form, cierra la sección y vuelve a mostrar el buscador
        document.getElementById("input-busqueda").value = dni;
        ejecutarBusqueda();
    });

    // Modal Materias (Pop-up)
    const modalMateria = document.getElementById("modal-materia");
    document.getElementById("btn-abrir-materia-modal").addEventListener("click", () => modalMateria.classList.remove("oculto"));
    window.cargarListadoMateriasParaModificar(); // <-- AGREGAR ESTA LÍNEA
    document.getElementById("btn-cerrar-modal").addEventListener("click", () => modalMateria.classList.add("oculto"));

    document.getElementById("form-nueva-materia").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nombre_materia = document.getElementById("mat-nombre").value.trim();
        const siglas = document.getElementById("mat-siglas").value.toUpperCase().trim();
        const curso = document.getElementById("mat-curso").value;

        const { error } = await window.supabaseCliente.from('materias').insert([{ nombre_materia, siglas, curso }]);
        if (error) {
            alert("Error al cargar materia: " + error.message);
        } else {
            alert("Materia dada de alta correctamente en el sistema.");
            document.getElementById("form-nueva-materia").reset();
            modalMateria.classList.add("oculto"); // Cierra pop-up
            if(alumnoSeleccionadoId) cargarBoletinEdicion(); // Recargar grilla si había alguien abierto
        }
    });
}

// --- BÚSQUEDA ---
// Limpia el texto que escribe la preceptora antes de insertarlo en el filtro .or() de PostgREST.
// La sintaxis de PostgREST usa ',', '.', '(', ')' y ':' como caracteres de control del propio
// filtro, y '%' / '_' como comodines de ILIKE. Si el término de búsqueda trae alguno de esos
// caracteres "crudo", puede romper la consulta o alterar el comportamiento del ILIKE.
// Como acá solo se busca por DNI, nombre o apellido, alcanza con permitir letras (con acentos/ñ),
// números, espacios y guiones, y descartar cualquier otra cosa.
function sanitizarTerminoBusqueda(texto) {
    return texto
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}\s-]/gu, '') // solo letras, números, espacios y guiones
        .trim()
        .slice(0, 60); // límite razonable de longitud
}

// Vuelve el buscador de estudiantes al estado inicial (como al entrar al panel):
// vacía el texto y el filtro por curso, borra los resultados de la tabla, y oculta
// el panel de edición del alumno que estuviera seleccionado (boletín/intensificar/
// recursar/observaciones), por si había uno abierto.
function limpiarBusquedaEstudiantes() {
    document.getElementById("input-busqueda").value = "";
    document.getElementById("select-filtro-curso").value = "";
    document.getElementById("resultados-estudiantes").innerHTML =
        `<tr><td colspan="4" class="text-center">Ingresá un término para buscar.</td></tr>`;

    ocultarPanelEdicionAlumno();
}

async function ejecutarBusqueda() {
    const terminoOriginal = document.getElementById("input-busqueda").value.trim();
    const termino = sanitizarTerminoBusqueda(terminoOriginal);
    const cursoSeleccionado = document.getElementById("select-filtro-curso").value;
    const tabla = document.getElementById("resultados-estudiantes");

    // Antes: al ejecutar una nueva búsqueda, el panel de edición del alumno
    // seleccionado anteriormente (boletín, intensificaciones, recursadas, etc.)
    // seguía visible con sus datos viejos. Lo ocultamos y reseteamos acá para
    // que cada nueva búsqueda arranque "limpia", sin datos de un alumno anterior.
    ocultarPanelEdicionAlumno();

    // Si ambos campos de control están vacíos, no hacemos nada
    if (!termino && !cursoSeleccionado) {
        if (terminoOriginal) {
            // El usuario escribió algo, pero eran todos caracteres no permitidos
            // (símbolos, puntuación, etc.) y la sanitización los descartó.
            tabla.innerHTML = `<tr class="fila-mensaje"><td colspan="4" class="text-center celda-mensaje">Usá solo letras, números y espacios para buscar.</td></tr>`;
        } else {
            tabla.innerHTML = `<tr class="fila-mensaje"><td colspan="4" class="text-center celda-mensaje">Buscando en los registros...</td></tr>`;
        }
        return;
    }

    tabla.innerHTML = `<tr><td colspan="4" class="text-center celda-mensaje">Buscando en los registros...</td></tr>`;
    
    try {
        let consulta = window.supabaseCliente.from('estudiantes').select('*');

        // --- LÓGICA DE PRIORIDAD ESCOLAR INTELIGENTE ---
        if (termino) {
            // PRIORIDAD 1: Si la preceptora escribió un texto (DNI, Nombre o Apellido),
            // buscamos al alumno en toda la escuela sin importar qué curso esté seleccionado en el menú.
            consulta = consulta.or(`dni.ilike.%${termino}%,nombre.ilike.%${termino}%,apellido.ilike.%${termino}%`);
            
            // Opcional: Limpiamos visualmente el selector de curso para que coincida con lo que pasa por detrás
            document.getElementById("select-filtro-curso").value = "";
        } else if (cursoSeleccionado) {
            // PRIORIDAD 2: Si el cuadro de texto está vacío pero se eligió un curso,
            // listamos a todos los alumnos que pertenezcan estrictamente a ese grupo.
            consulta = consulta.eq('curso_actual', cursoSeleccionado);
        }

        // Ejecutamos la petición ordenando alfabéticamente por apellido
        const { data, error } = await consulta.order('apellido');

        if (error) throw error;

        if (!data || data.length === 0) {
           tabla.innerHTML = `<tr class="fila-mensaje"><td colspan="4" class="text-center celda-mensaje">No se encontraron estudiantes para esa búsqueda.</td></tr>`;
            return;
        }

        // Renderizar el listado con los botones de gestión y eliminación de alumnos
        // (usamos data-* + listeners en vez de onclick="...('${valor}')" para que apellidos
        // con apóstrofes, comillas u otros caracteres especiales no rompan el HTML generado)
        tabla.innerHTML = data.map(est => `
            <tr>
                <td data-label="DNI">${escapeHTML(est.dni)}</td>
                <td data-label="Nombre y Apellido"><b>${escapeHTML(est.apellido.toUpperCase())}, ${escapeHTML(est.nombre)}</b></td>
                <td data-label="Curso">${escapeHTML(est.curso_actual)}</td>
                <td data-label="Acciones">
                     <div class="botones-buscador-estudiantes">
                         <button class="btn-principal btn-tabla btn-azul btn-gestionar"
                                 data-id="${escapeHTML(est.id)}"
                                 data-nombre="${escapeHTML(est.nombre + ' ' + est.apellido)}"
                                 data-dni="${escapeHTML(est.dni)}"
                                 data-curso="${escapeHTML(est.curso_actual)}"
                                 data-obs="${escapeHTML(est.observaciones || '')}">Gestionar ⚙️</button>
                         <button class="btn-secundario btn-tabla btn-borrar" style="color: var(--color-error); border: 1px solid #fca5a5; background: #fff5f5; padding: 4px 8px;"
                                 data-id="${escapeHTML(est.id)}"
                                 data-apellido="${escapeHTML(est.apellido.toUpperCase())}">Borrar 🗑️</button>
                   </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error("Error en la búsqueda:", err.message);
        tabla.innerHTML = `<tr class="fila-mensaje"><td colspan="4" class="text-center celda-mensaje" style="color: var(--color-error);">Error al conectar con los registros de Supabase.</td></tr>`;
    }
}

// Delegación de eventos para los botones "Gestionar" y "Borrar" de la tabla de resultados
// (se registra una sola vez; funciona aunque la tabla se vuelva a renderizar con nuevos datos)
document.addEventListener("click", (e) => {
    const btnGestionar = e.target.closest(".btn-gestionar");
    if (btnGestionar) {
        const d = btnGestionar.dataset;
        seleccionarEstudiante(d.id, d.nombre, d.dni, d.curso, d.obs);
        return;
    }

    const btnBorrar = e.target.closest(".btn-borrar");
    if (btnBorrar) {
        window.eliminarEstudianteDeRaiz(btnBorrar.dataset.id, btnBorrar.dataset.apellido);
    }
});



// NUEVA FUNCIÓN GLOBAL PARA BORRAR ALUMNOS DESDE LA TABLA
window.eliminarEstudianteDeRaiz = async function(idAlumno, apellido) {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al estudiante ${apellido}? Se borrará también todo su boletín y trayectoria.`)) return;

    try {
        const { error } = await window.supabaseCliente.from('estudiantes').delete().eq('id', idAlumno);
        if (error) throw error;
        alert("Estudiante eliminado del sistema correctamente.");
        ejecutarBusqueda(); // Refrescar la tabla actual
    } catch (err) {
        alert("No se pudo eliminar al estudiante.");
    }
};



// Oculta y resetea por completo el panel de edición (boletín/intensificar/recursar/obs)
// del alumno que estuviera seleccionado antes. Se llama tanto al ejecutar una nueva
// búsqueda como al empezar a seleccionar un alumno distinto, para no dejar a la vista
// datos de un alumno que ya no es el que se está gestionando.
function ocultarPanelEdicionAlumno() {
    alumnoSeleccionadoId = null;
    document.getElementById("seccion-edicion-alumno").classList.add("oculto");
    document.getElementById("nombre-alumno-sel").textContent = "--";
    document.getElementById("dni-alumno-sel").textContent = "--";
    document.getElementById("curso-alumno-sel").textContent = "--";

    const textareaObs = document.getElementById("textarea-obs");
    if (textareaObs) textareaObs.value = "";

    document.getElementById("tabla-edicion-boletin").innerHTML = "";
    const listaInt = document.getElementById("lista-int-cargar");
    if (listaInt) listaInt.innerHTML = "";
    const listaRec = document.getElementById("lista-rec-cargar");
    if (listaRec) listaRec.innerHTML = "";

    // Volvemos siempre a la pestaña "Boletín" para que el próximo alumno
    // que se seleccione arranque desde la misma pestaña por defecto.
    if (typeof window.cambiarPestana === "function") {
        window.cambiarPestana("pestana-boletin");
    }
}

async function seleccionarEstudiante(id, nombre, dni, curso, obs) {
    // Si ya había otro alumno cargado, limpiamos su panel antes de mostrar
    // los datos del nuevo para que no se mezclen ni queden restos visibles
    // mientras se cargan boletín/intensificaciones/recursadas del alumno nuevo.
    if (alumnoSeleccionadoId && alumnoSeleccionadoId !== id) {
        ocultarPanelEdicionAlumno();
    }

    alumnoSeleccionadoId = id;
    document.getElementById("seccion-edicion-alumno").classList.remove("oculto");
    document.getElementById("nombre-alumno-sel").textContent = nombre;
    document.getElementById("dni-alumno-sel").textContent = dni;
    document.getElementById("curso-alumno-sel").textContent = curso;
    document.getElementById("textarea-obs").value = obs;

    document.getElementById("seccion-edicion-alumno").scrollIntoView({ behavior: 'smooth' });

    // Actualizar autocompletados de materias según el curso de este alumno
    await inicializarAutocompletarMaterias(curso);

    cargarBoletinEdicion();
    cargarIntensificacionesEdicion();
    cargarRecursadasEdicion();
}

// Llenar el selector de intensificación/recursada solo con las materias del curso correspondiente
// (Implementación real de inicializarAutocompletarMaterias más abajo, cerca del final del archivo.
// Antes había 3 declaraciones de la misma función en este archivo; en JS gana la última,
// así que las 2 anteriores nunca se ejecutaban. Se dejaron unificadas en una sola versión
// que sí filtra por curso del alumno.)

// --- BOLETÍN CON SELECTS (TEA, TEP, TED) Y LOGICA DE NÚMEROS ENTEROS DEL 1 AL 10 ---
async function cargarBoletinEdicion() {
    const tabla = document.getElementById("tabla-edicion-boletin");
    tabla.innerHTML = `<tr><td colspan="8" class="text-center">Cargando...</td></tr>`;

    const cursoActual = document.getElementById("curso-alumno-sel").textContent;
    const { data: materias } = await window.supabaseCliente.from('materias').select('*').eq('curso', cursoActual).order('nombre_materia');
    const { data: notas } = await window.supabaseCliente.from('boletines').select('*').eq('estudiante_id', alumnoSeleccionadoId);

    if (!materias || materias.length === 0) {
        tabla.innerHTML = `<tr><td colspan="8" class="text-center">No hay materias registradas para el curso ${cursoActual}.</td></tr>`;
        return;
    }

    tabla.innerHTML = materias.map(m => {
        const n = notas ? (notas.find(nota => nota.materia_id === m.id) || {}) : {};
        
        // Función auxiliar para dejar seleccionada la opción correcta del informe valorativo
        const optionSel = (val, comp) => val === comp ? 'selected' : '';

        return `
            <tr>
                <td style="text-align: left; font-weight: 600;">${m.nombre_materia.toUpperCase()}</td>
                
                <!-- 1er Informe de Avance (Select) -->
                <td>
                    <select id="inf1-${m.id}" style="padding: 4px; border-radius: 4px;">
                        <option value="" ${optionSel(n.primer_informe, '')}>-</option>
                        <option value="TEA" ${optionSel(n.primer_informe, 'TEA')}>TEA</option>
                        <option value="TEP" ${optionSel(n.primer_informe, 'TEP')}>TEP</option>
                        <option value="TED" ${optionSel(n.primer_informe, 'TED')}>TED</option>
                    </select>
                </td>
                
                <!-- 1er Cuatrimestre (Entero 1 al 10) -->
                <td>
                    <input type="number" id="cuat1-${m.id}" min="1" max="10" step="1" style="width: 50px; text-align: center;" value="${n.primer_cuatrimestre ?? ''}">
                </td>
                
                <!-- 2do Informe de Avance (Select) -->
                <td>
                    <select id="inf2-${m.id}" style="padding: 4px; border-radius: 4px;">
                        <option value="" ${optionSel(n.segundo_informe, '')}>-</option>
                        <option value="TEA" ${optionSel(n.segundo_informe, 'TEA')}>TEA</option>
                        <option value="TEP" ${optionSel(n.segundo_informe, 'TEP')}>TEP</option>
                        <option value="TED" ${optionSel(n.segundo_informe, 'TED')}>TED</option>
                    </select>
                </td>
                
                <!-- 2do Cuatrimestre (Entero 1 al 10) -->
                <td>
                    <input type="number" id="cuat2-${m.id}" min="1" max="10" step="1" style="width: 50px; text-align: center;" value="${n.segundo_cuatrimestre ?? ''}">
                </td>
                
                <!-- Nota Anual -->
                <td>
                    <input type="number" id="anual-${m.id}" min="1" max="10" step="1" style="width: 50px; text-align: center; font-weight: bold;" value="${n.nota_anual ?? ''}">
                </td>
                
                <!-- Nota Final -->
                <td>
                    <input type="number" id="final-${m.id}" min="1" max="10" step="1" style="width: 50px; text-align: center; font-weight: bold; background-color: #fffde6;" value="${n.nota_final ?? ''}">
                </td>
                
                <!-- Botón Guardar -->
                <td>
                    <button class="btn-principal btn-tabla" style="background-color: var(--color-exito); width: auto; padding: 4px 8px;" onclick="guardarFilaBoletin(${m.id})">💾 Guardar</button>
                </td>
            </tr>
        `;
    }).join('');
}
// --- FUNCIONES DE CARGA REQUERIDAS POR SELECCIONAR_ESTUDIANTE ---

window.cargarIntensificacionesEdicion = async function() {
    const div = document.getElementById("lista-int-cargar");
    if (!div) return;

    try {
        const { data, error } = await window.supabaseCliente
            .from('intensificaciones')
            .select('*')
            .eq('estudiante_id', alumnoSeleccionadoId);

        if (error) throw error;

        if (!data || data.length === 0) {
            div.innerHTML = `<p style="color:#64748b; font-size:0.9rem;">No hay materias a intensificar cargadas.</p>`;
            return;
        }

        // Dibujamos las tarjetas limpias con el botón de eliminar visible
        div.innerHTML = data.map(i => `
            <div class="elemento-lista" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px; margin-bottom: 8px; border-left: 4px solid var(--color-secundario); border-radius: 4px;">
                <div>
                    <span style="font-size: 1rem; color: var(--color-primario);">📐 <b>${i.materia}</b></span><br>
                    <small style="color: #475569; font-weight: 500;">⏱ Horario: ${i.horario}</small><br>
                    <small style="color: #0284c7; font-weight: 600;">📌 ${i.dia}</small>
                </div>
                <button class="btn-secundario btn-tabla" style="color: var(--color-error); border: 1px solid #fca5a5; background: #fff5f5; width: auto; padding: 6px 12px; font-weight: bold;" onclick="window.eliminarFilaTrayectoria('intensificaciones', ${i.id}, 'int')">Eliminar 🗑</button>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
    }
};



window.cargarRecursadasEdicion = async function() {
    const div = document.getElementById("lista-rec-cargar");
    if (!div) return;

    try {
        const { data, error } = await window.supabaseCliente
            .from('recursadas')
            .select('*')
            .eq('estudiante_id', alumnoSeleccionadoId);

        if (error) throw error;

        if (!data || data.length === 0) {
            div.innerHTML = `<p style="color:#64748b; font-size:0.9rem;">No hay materias a recursar cargadas.</p>`;
            return;
        }

        div.innerHTML = data.map(r => `
            <div class="elemento-lista" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px; margin-bottom: 8px; border-left: 4px solid var(--color-primario); border-radius: 4px;">
                <div>
                    <span style="font-size: 1rem; color: #0f172a;">🔄 <b>${r.materia}</b></span><br>
                    <small style="color: #475569; font-weight: 600;">🏫 Curso: ${r.curso_recursada}</small><br>
                    <small style="color: #475569; font-weight: 500;">⏱ Horario: ${r.horario}</small>
                </div>
                <button class="btn-secundario btn-tabla" style="color: var(--color-error); border: 1px solid #fca5a5; background: #fff5f5; width: auto; padding: 6px 12px; font-weight: bold;" onclick="window.eliminarFilaTrayectoria('recursadas', ${r.id}, 'rec')">Eliminar 🗑</button>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
    }
};

// 1. FUNCIÓN PARA CAMBIAR ENTRE PESTAÑAS (Boletín, Intensificar, Recursar, Obs)
window.cambiarPestana = function(pestanaId) {
    console.log("Cambiando a la pestaña:", pestanaId);
    
    // Ocultar todos los bloques de contenido
    document.querySelectorAll(".tab-contenido").forEach(el => el.classList.add("oculto"));
    // Quitar el estado activo de todos los botones de las pestañas
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("activo"));

    // Mostrar el bloque de la pestaña seleccionada
    const pestanaActiva = document.getElementById(pestanaId);
    if (pestanaActiva) {
        pestanaActiva.classList.remove("oculto");
    }
    
    // Buscar el botón correspondiente por su atributo onclick para ponerlo en gris oscuro (activo)
    const botonActivo = Array.from(document.querySelectorAll(".tab-btn")).find(btn => btn.getAttribute("onclick").includes(pestanaId));
    if (botonActivo) {
        botonActivo.classList.add("activo");
    }
};

window.eliminarFilaTrayectoria = async function(tabla, id, tipo) {
    if (!confirm("¿Estás seguro de que deseas eliminar esta materia de la trayectoria del alumno?")) return;

    try {
        const { error } = await window.supabaseCliente
            .from(tabla)
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert("Registro eliminado correctamente.");
        
        // Refrescamos la pestaña correspondiente
        if (tipo === 'int') window.cargarIntensificacionesEdicion();
        if (tipo === 'rec') window.cargarRecursadasEdicion();

    } catch (err) {
        console.error(err);
        alert("No se pudo eliminar el registro de Supabase.");
    }
};

// 2. FUNCIÓN PARA GUARDAR LAS CALIFICACIONES DE UNA MATERIA INDIVIDUAL
window.guardarFilaBoletin = async function(materiaId) {
    console.log("Intentando guardar calificaciones para la materia ID:", materiaId);
    
    try {
        // Capturar los valores ingresados en la fila correspondiente
        const p_inf = document.getElementById(`inf1-${materiaId}`).value;
        const p_cuat = parseInt(document.getElementById(`cuat1-${materiaId}`).value) || null;
        const s_inf = document.getElementById(`inf2-${materiaId}`).value;
        const s_cuat = parseInt(document.getElementById(`cuat2-${materiaId}`).value) || null;
        const anual = parseInt(document.getElementById(`anual-${materiaId}`).value) || null;
        const final = parseInt(document.getElementById(`final-${materiaId}`).value) || null;

        // Comprobar en Supabase si este alumno ya tiene una fila de notas creada para esta materia
        const { data: existente, error: errCheck } = await window.supabaseCliente
            .from('boletines')
            .select('id')
            .eq('estudiante_id', alumnoSeleccionadoId)
            .eq('materia_id', materiaId)
            .maybeSingle();

        if (errCheck) throw errCheck;

        // Estructurar los datos que vamos a mandar a PostgreSQL
        const payload = {
            estudiante_id: alumnoSeleccionadoId,
            materia_id: materiaId,
            primer_informe: p_inf,
            primer_cuatrimestre: p_cuat,
            segundo_informe: s_inf,
            segundo_cuatrimestre: s_cuat,
            nota_anual: anual,
            nota_final: final
        };

        let resultadoError = null;

        if (existente) {
            // Si ya existía la fila, hacemos un UPDATE
            const { error: errUpdate } = await window.supabaseCliente
                .from('boletines')
                .update(payload)
                .eq('id', existente.id);
            resultadoError = errUpdate;
        } else {
            // Si es una materia nueva que no tenía notas previas, hacemos un INSERT
            const { error: errInsert } = await window.supabaseCliente
                .from('boletines')
                .insert([payload]);
            resultadoError = errInsert;
        }

        if (resultadoError) {
            throw resultadoError;
        }

        alert("¡Calificación guardada y sincronizada correctamente en Supabase!");

    } catch (error) {
        console.error("Error crítico al guardar la fila del boletín:", error.message);
        alert("Ocurrió un error al guardar. Asegúrate de ingresar números válidos.");
    }
};

async function inicializarAutocompletarMaterias(cursoEstudiante) {
    console.log("Cargando lista de materias para autocompletar del curso:", cursoEstudiante);
    
    const selectIntMateria = document.getElementById("int-materia");
    const selectRecMateria = document.getElementById("rec-materia");
    const selectIntDestino = document.getElementById("int-materia-destino");

    try {
        // Traemos de Supabase solo las materias que pertenecen al curso del alumno seleccionado
        // (antes esta consulta traía TODAS las materias de la escuela sin filtrar, permitiendo
        // elegir por error materias de otros cursos/años)
        const { data: materias, error } = await window.supabaseCliente
            .from('materias')
            .select('*')
            .eq('curso', cursoEstudiante)
            .order('nombre_materia');

        if (error) throw error;

        if (materias && materias.length > 0) {
            // Generamos las opciones base en MAYÚSCULAS mostrando el curso
            const opcionesHTML = materias.map(m => 
                `<option value="${m.nombre_materia.toUpperCase()}">${m.nombre_materia.toUpperCase()} (${m.curso})</option>`
            ).join('');
            
            // Inyectamos en cada selector correspondiente
            if (selectIntMateria) {
                selectIntMateria.innerHTML = `<option value="">-- Materia que intensifica --</option>` + opcionesHTML;
            }
            if (selectRecMateria) {
                selectRecMateria.innerHTML = `<option value="">-- Seleccionar Materia a Recursar --</option>` + opcionesHTML;
            }
            if (selectIntDestino) {
                selectIntDestino.innerHTML = `<option value="">-- Materia donde intensifica --</option>` + opcionesHTML;
            }
        } else {
            const opcionVacia = `<option value="">-- No hay materias cargadas --</option>`;
            if (selectIntMateria) selectIntMateria.innerHTML = opcionVacia;
            if (selectRecMateria) selectRecMateria.innerHTML = opcionVacia;
            if (selectIntDestino) selectIntDestino.innerHTML = opcionVacia;
        }

    } catch (err) {
        console.error("Error al poblar los selectores:", err.message);
    }
}


window.guardarObservacionesAlumno = async function() {
    console.log("Intentando guardar observaciones para el alumno ID:", alumnoSeleccionadoId);
    
    if (!alumnoSeleccionadoId) {
        alert("Primero debes seleccionar un estudiante.");
        return;
    }

    const textoObs = document.getElementById("textarea-obs").value.trim();

    try {
        const { error } = await window.supabaseCliente
            .from('estudiantes')
            .update({ observaciones: textoObs })
            .eq('id', alumnoSeleccionadoId);

        if (error) throw error;

        alert("¡Observaciones guardadas y sincronizadas en Supabase con éxito!");

    } catch (err) {
        console.error("Error al guardar observaciones:", err.message);
        alert("No se pudieron guardar las observaciones. Revisa la conexión.");
    }
};

// --- FUNCIONES GLOBALES PARA INTENSIFICACIONES Y RECURSADAS (AL FINAL DE PANEL.JS) ---

// --- REEMPLAZAR EN TU PANEL.JS ---
window.procesarAltaIntensificacion = async function(event) {
    event.preventDefault();
    if (!alumnoSeleccionadoId) return alert("Primero debés seleccionar un alumno.");

    const matAdeudada = document.getElementById("int-materia").value;
    const matDestino = document.getElementById("int-materia-destino").value;
    const d1 = document.getElementById("int-dia").value;
    const h1 = document.getElementById("int-horario").value;
    const d2 = document.getElementById("int-dia-2").value;
    const h2 = document.getElementById("int-horario-2").value;

    if (!matAdeudada || !matDestino) {
        alert("Por favor, selecciona ambas materias de los menús desplegables.");
        return;
    }

    // Armamos la cadena de horarios reales
    let detalleHorario = `${d1} de ${h1}`;
    if (d2 && h2) {
        detalleHorario += ` y ${d2} de ${h2}`;
    }

    // Formateamos la aclaración de la materia de destino de manera limpia
    const descripcionFinal = `Intensifica en: ${matDestino}`;

    try {
        const { error } = await window.supabaseCliente
            .from('intensificaciones')
            .insert([
                { 
                    estudiante_id: alumnoSeleccionadoId, 
                    materia: matAdeudada, 
                    dia: descripcionFinal, 
                    horario: detalleHorario 
                }
            ]);

        if (error) throw error;

        alert("¡Materia a intensificar guardada con éxito!");
        document.getElementById("form-intensificar").reset();
        
        // Refrescamos la lista de abajo para renderizar la nueva tarjeta con su botón eliminar
        cargarIntensificacionesEdicion();

    } catch (err) {
        console.error("Error en alta intensificación:", err.message);
        alert("Ocurrió un error al intentar guardar en Supabase.");
    }
};


window.procesarAltaRecursada = async function(event) {
    event.preventDefault();
    console.log("Procesando alta de recursada para el alumno ID:", alumnoSeleccionadoId);

    if (!alumnoSeleccionadoId) return alert("Primero debés seleccionar un alumno.");

    const mat = document.getElementById("rec-materia").value;
    const cur = document.getElementById("rec-curso").value; // Curso a contraturno
    const d1 = document.getElementById("rec-dia").value;
    const h1 = document.getElementById("rec-horario").value;
    const d2 = document.getElementById("rec-dia-2").value;
    const h2 = document.getElementById("rec-horario-2").value;

    let horarioFinal = `${d1} (${h1})`;
    if (d2 && h2) {
        horarioFinal += ` y ${d2} (${h2})`;
    }

    try {
        const { error } = await window.supabaseCliente
            .from('recursadas')
            .insert([
                { estudiante_id: alumnoSeleccionadoId, materia: mat, curso_recursada: cur, dia: "Asignado", horario: horarioFinal }
            ]);

        if (error) throw error;

        alert("¡Materia a recursar guardada con éxito!");
        document.getElementById("form-recursar").reset();
        
        // Recargamos el listado visual de abajo para que la preceptora vea que se agregó
        cargarRecursadasEdicion();

    } catch (err) {
        console.error("Error al guardar recursada:", err.message);
        alert("Ocurrió un error al intentar guardar en Supabase.");
    }
};


// Función para listar las materias adentro del pop-up con botón de eliminar
window.cargarListadoMateriasParaModificar = async function() {
    const contenedor = document.getElementById("lista-materias-globales-borrar");
    if (!contenedor) return;

    try {
        const { data: materias } = await window.supabaseCliente.from('materias').select('*').order('curso').order('nombre_materia');
        
        if (!materias || materias.length === 0) {
            contenedor.innerHTML = `<p style="font-size:0.85rem; color:#64748b;">No hay materias cargadas en la institución.</p>`;
            return;
        }

        contenedor.innerHTML = materias.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:6px 10px; border-radius:6px; font-size:0.85rem;">
                <span><b>${m.siglas}</b> - ${m.nombre_materia.toUpperCase()} (${m.curso})</span>
                <button type="button" style="color:var(--color-error); background:none; font-weight:bold; width:auto; padding:2px 6px;" onclick="window.eliminarMateriaEscuela(${m.id})">❌</button>
            </div>
        `).join('');
    } catch(err) {}
};

window.eliminarMateriaEscuela = async function(materiaId) {
    if (!confirm("¿Estás seguro de borrar esta materia? Se eliminará de todos los boletines de los alumnos que pertenezcan a este curso.")) return;

    try {
        await window.supabaseCliente.from('materias').delete().eq('id', materiaId);
        alert("Materia eliminada correctamente.");
        window.cargarListadoMateriasParaModificar();
        if (alumnoSeleccionadoId) cargarBoletinEdicion(); // Recargar el boletín si hay ficha abierta
    } catch (err) {}
};

/* ==========================================================================
   MÓDULO DE CARGA MASIVA DE CALIFICACIONES (BOLETINES)
   ========================================================================== */

// 1. Funciones básicas de apertura y cierre del panel visual
function mostrarPanelCargaNotas() {
    // Si el formulario de "Registrar Nuevo Estudiante" está abierto, lo cerramos
    // primero para que nunca queden los dos formularios abiertos a la vez.
    cerrarFormularioNuevoAlumno();

    document.getElementById("seccion-carga-notas").style.display = "block";
    document.getElementById("seccion-carga-notas").scrollIntoView({ behavior: 'smooth' });
    inicializarCursosCalificaciones();

    // Ocultamos el buscador de estudiantes mientras se cargan notas: no hace falta
    // verlo en ese momento, y así se gana espacio en pantalla.
    const seccionBuscador = document.getElementById("seccion-buscador-estudiantes");
    if (seccionBuscador) seccionBuscador.style.display = "none";
}

function cerrarPanelCargaNotas() {
    document.getElementById("seccion-carga-notas").style.display = "none";
    // Resetear filtros
    document.getElementById("notas-select-curso").value = "";
    const selectMateria = document.getElementById("notas-select-materia");
    selectMateria.innerHTML = '<option value="">-- Seleccioná primero el curso --</option>';
    selectMateria.disabled = true;
    document.getElementById("tbody-planilla-notas").innerHTML = `<tr><td colspan="2" class="text-center" style="padding: 20px; color: #718096;">Seleccioná un curso y una materia para desplegar la planilla de alumnos.</td></tr>`;
    document.getElementById("bloque-guardar-notas").style.display = "none";

    // Al cerrar, volvemos a mostrar el buscador de estudiantes.
    const seccionBuscador = document.getElementById("seccion-buscador-estudiantes");
    if (seccionBuscador) seccionBuscador.style.display = "block";
}

// 2. Cargar materias dinámicamente según el curso seleccionado
async function cargarMateriasPorCurso() {
    const curso = document.getElementById("notas-select-curso").value;
    const selectMateria = document.getElementById("notas-select-materia");
    const tbody = document.getElementById("tbody-planilla-notas");
    
    // Limpiamos y deshabilitamos campos inferiores si no hay curso seleccionado
    if (!curso) {
        selectMateria.innerHTML = '<option value="">-- Seleccioná primero el curso --</option>';
        selectMateria.disabled = true;
        tbody.innerHTML = `<tr><td colspan="2" class="text-center" style="padding: 20px; color: #718096;">Seleccioná un curso y una materia para desplegar la planilla de alumnos.</td></tr>`;
        document.getElementById("bloque-guardar-notas").style.display = "none";
        return;
    }

    selectMateria.innerHTML = '<option value="">Cargando materias...</option>';
    
    try {
        // Consultamos a la tabla 'materias' filtrando por la columna 'curso'
        const { data: materias, error } = await window.supabaseCliente
            .from('materias')
            .select('id, nombre_materia')
            .eq('curso', curso)
            .order('nombre_materia');

        if (error) throw error;

        if (!materias || materias.length === 0) {
            selectMateria.innerHTML = '<option value="">No hay materias registradas en este curso</option>';
            selectMateria.disabled = true;
            return;
        }

        // Rellenamos el selector de materias
        let opciones = '<option value="">-- Elegir Materia --</option>';
        materias.forEach(mat => {
            opciones += `<option value="${mat.id}">${mat.nombre_materia}</option>`;
        });
        selectMateria.innerHTML = opciones;
        selectMateria.disabled = false;

    } catch (err) {
        console.error("Error al cargar materias:", err.message);
        alert("Hubo un problema al consultar las materias de este curso.");
    }
}

// 3. Generar la planilla general de estudiantes y precargar notas existentes
async function cargarPlanillaEstudiantes() {
    const curso = document.getElementById("notas-select-curso").value;
    const materiaId = document.getElementById("notas-select-materia").value;
    const periodo = document.getElementById("notas-select-periodo").value;
    const tbody = document.getElementById("tbody-planilla-notas");
    const btnGuardar = document.getElementById("bloque-guardar-notas");

    if (!curso || !materiaId) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center" style="padding: 20px; color: #718096;">Seleccioná un curso y una materia para desplegar la planilla de alumnos.</td></tr>`;
        btnGuardar.style.display = "none";
        return;
    }

    tbody.innerHTML = '<tr><td colspan="2" class="text-center" style="padding: 20px;">Estructurando planilla de calificaciones...</td></tr>';

    try {
        // Paso A: Traer todos los alumnos de ese curso ordenados alfabéticamente
        const { data: alumnos, error: errorAlumnos } = await window.supabaseCliente
            .from('estudiantes')
            .select('id, nombre, apellido')
            .eq('curso_actual', curso)
            .order('apellido');

        if (errorAlumnos) throw errorAlumnos;

        if (!alumnos || alumnos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center" style="padding: 20px; color: #ef4444;">No hay estudiantes cargados en este curso.</td></tr>';
            btnGuardar.style.display = "none";
            return;
        }

        // Paso B: Traer todos los boletines existentes de esta materia para pre-cargar las notas guardadas
        const { data: boletinesExistentes, error: errorBoletines } = await window.supabaseCliente
            .from('boletines')
            .select('estudiante_id, primer_informe, primer_cuatrimestre, segundo_informe, segundo_cuatrimestre, nota_anual, nota_final')
            .eq('materia_id', parseInt(materiaId));

        if (errorBoletines) throw errorBoletines;

        // Mapeamos los boletines en un objeto llave-valor rápido indexado por 'estudiante_id'
        const notasMapeadas = {};
        if (boletinesExistentes) {
            boletinesExistentes.forEach(b => {
                notasMapeadas[b.estudiante_id] = b;
            });
        }

        // Paso C: Renderizar las filas de la tabla
        let HTMLFilas = "";
        
        alumnos.forEach(alu => {
            // Evaluamos si el alumno ya cuenta con fila de boletín y nota previa en este periodo
            const registroBoletin = notasMapeadas[alu.id] || null;
            const notaActual = registroBoletin ? registroBoletin[periodo] : "";

            // Generamos el menú selector adecuado basado en el tipo de periodo
            const campoCalificacion = generarSelectorNota(alu.id, periodo, notaActual);

            HTMLFilas += `
                <tr class="fila-nota-estudiante" data-estudiante-id="${alu.id}">
                    <td style="font-weight: 600; padding: 12px; vertical-align: middle;">
                        ${alu.apellido.toUpperCase()}, ${alu.nombre}
                    </td>
                    <td style="text-align: center; padding: 12px; vertical-align: middle;">
                        ${campoCalificacion}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = HTMLFilas;
        btnGuardar.style.display = "block"; // Desplegamos el botón de guardado general único

    } catch (err) {
        console.error("Error al estructurar la planilla:", err.message);
        tbody.innerHTML = '<tr><td colspan="2" class="text-center" style="padding: 20px; color: #ef4444;">Error de comunicación al compilar la planilla.</td></tr>';
    }
}

// 4. Alternar de forma dinámica las reglas del control de notas (Cualitativo vs Numérico)
function generarSelectorNota(estudianteId, periodo, valorActual) {
    // Si el periodo incluye la palabra 'informe', creamos un select cualitativo (TEA, TEP, TED)
    if (periodo.includes("informe")) {
        const opciones = ["", "TEA", "TEP", "TED"];
        let selector = `<select class="select-nota-alumno form-control" data-estudiante="${estudianteId}">`;
        opciones.forEach(op => {
            const selected = (String(valorActual) === op) ? "selected" : "";
            selector += `<option value="${op}" ${selected}>${op || '-- Sin Calificar --'}</option>`;
        });
        selector += `</select>`;
        return selector;
    } else {
        // Para cuatrimestres, anual y final, creamos select numérico del 1 al 10 enteros
        let selector = `<select class="select-nota-alumno form-control" data-estudiante="${estudianteId}">`;
        selector += `<option value="">-- Sin Calificar --</option>`;
        for (let i = 1; i <= 10; i++) {
            const selected = (parseInt(valorActual) === i) ? "selected" : "";
            selector += `<option value="${i}" ${selected}>${i}</option>`;
        }
        selector += `</select>`;
        return selector;
    }
}

// 5. Listener de cambio para refrescar la planilla si el usuario cambia el periodo
function actualizarColumnaPeriodo() {
    const materiaId = document.getElementById("notas-select-materia").value;
    if (materiaId) {
        // Re-renderiza los inputs para cambiar entre letras y números sin perder el contexto del alumno
        cargarPlanillaEstudiantes();
    }
}

async function guardarNotasGenerales() {
    const materiaId = document.getElementById("notas-select-materia").value;
    const periodo = document.getElementById("notas-select-periodo").value;
    const selectores = document.querySelectorAll(".select-nota-alumno");

    if (!materiaId || selectores.length === 0) return;

    // Indicador visual de carga en el botón
    const btnGuardar = document.querySelector("#bloque-guardar-notas button");
    const textoOriginal = btnGuardar.innerHTML;
    btnGuardar.innerHTML = "Guardando calificaciones en Supabase... ⏳";
    btnGuardar.disabled = true;

    const registrosABoletines = [];

    // Recorremos cada selector de la planilla
    selectores.forEach(select => {
        // Extraemos el ID del alumno guardado en el atributo 'data-estudiante'
        const idDelEstudiante = select.getAttribute("data-estudiante");
        let valorNota = select.value;

        // Validamos el tipo de dato según el periodo académico
        if (!periodo.includes("informe") && valorNota !== "") {
            valorNota = parseInt(valorNota);
        } else if (valorNota === "") {
            valorNota = null; // Celda vacía va como NULL a Supabase
        }

        // Armamos el objeto de forma ultra explícita utilizando nombres de variables diferentes
        const filaBoletin = {
            estudiante_id: idDelEstudiante, // Nombre exacto de la columna en Supabase
            materia_id: parseInt(materiaId), // Nombre exacto de la columna en Supabase
            [periodo]: valorNota // Columna dinámica (ej: primer_cuatrimestre)
        };

        registrosABoletines.push(filaBoletin);
    });

    try {
        // Enviamos el lote completo a Supabase resolviendo conflictos por clave única compuesta
        const { error } = await window.supabaseCliente
            .from('boletines')
            .upsert(registrosABoletines, { onConflict: 'estudiante_id,materia_id' });

        if (error) throw error;

        alert("¡Excelente! Todas las calificaciones se actualizaron y guardaron correctamente. 💾✨");
        
        // Refrescamos la planilla para asegurar la consistencia visual
        await cargarPlanillaEstudiantes();

    } catch (err) {
        console.error("Error en upsert masivo de boletines:", err.message);
        alert(`Ocurrió un error al procesar el guardado general: ${err.message}`);
    } finally {
        // Devolvemos el botón a su estado original
        btnGuardar.innerHTML = textoOriginal;
        btnGuardar.disabled = false;
    }
}
