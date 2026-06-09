let alumnoSeleccionadoId = null;

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
    // 1. CONTROL DE ACCESO
    const { data: { session } } = await window.supabaseCliente.auth.getSession();
    if (!session) {
        alert("Acceso denegado.");
        window.location.href = "index.html";
        return;
    }
    document.getElementById("info-usuario").textContent = `Conectado como: ${session.user.email}`;

    // 2. INYECTAR OPCIONES PREESTABLECIDAS EN LOS SELECTS DE LA PÁGINA
    inicializarSelectoresGlobales();

    // 3. BUSCADOR
    document.getElementById("btn-buscar").addEventListener("click", ejecutarBusqueda);
    document.getElementById("input-busqueda").addEventListener("keypress", (e) => { if (e.key === "Enter") ejecutarBusqueda(); });

    // 4. MODAL MATERIAS Y MENÚ DESPLEGABLE NUEVO ALUMNO
    configurarComponentesInterfaz();

    // 5. CERRAR SESIÓN
    document.getElementById("btn-cerrar-sesion").addEventListener("click", async () => {
        await window.supabaseCliente.auth.signOut();
        window.location.href = "index.html";
    });
});

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

function configurarComponentesInterfaz() {
    // Toggle Formulario Alumno
    const btnToggleAlumno = document.getElementById("btn-toggle-nuevo-alumno");
    const seccionAlumno = document.getElementById("seccion-nuevo-alumno");
    btnToggleAlumno.addEventListener("click", () => {
        seccionAlumno.classList.toggle("oculto");
    });

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
        document.getElementById("form-nuevo-estudiante").reset();
        seccionAlumno.classList.add("oculto"); // Se cierra el formulario automáticamente
        document.getElementById("input-busqueda").value = dni;
        ejecutarBusqueda();
    });

    // Modal Materias (Pop-up)
    const modalMateria = document.getElementById("modal-materia");
    document.getElementById("btn-abrir-materia-modal").addEventListener("click", () => modalMateria.classList.remove("oculto"));
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
async function ejecutarBusqueda() {
    const termino = document.getElementById("input-busqueda").value.trim();
    const tabla = document.getElementById("resultados-estudiantes");
    if (!termino) return;

    tabla.innerHTML = `<tr><td colspan="4" class="text-center">Buscando...</td></tr>`;
    const { data } = await window.supabaseCliente.from('estudiantes').select('*')
        .or(`dni.ilike.%${termino}%,nombre.ilike.%${termino}%,apellido.ilike.%${termino}%,curso_actual.ilike.%${termino}%`);

    if (!data || data.length === 0) {
        tabla.innerHTML = `<tr><td colspan="4" class="text-center">No se encontraron resultados.</td></tr>`;
        return;
    }

    tabla.innerHTML = data.map(est => `
        <tr>
            <td>${est.dni}</td>
            <td><b>${est.apellido.toUpperCase()}, ${est.nombre}</b></td>
            <td>${est.curso_actual}</td>
            <td><button class="btn-principal btn-tabla btn-azul" onclick="seleccionarEstudiante('${est.id}', '${est.nombre} ${est.apellido}', '${est.dni}', '${est.curso_actual}', '${est.observaciones || ''}')">Gestionar Trayectoria ⚙️</button></td>
        </tr>
    `).join('');
}

async function seleccionarEstudiante(id, nombre, dni, curso, obs) {
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
async function inicializarAutocompletarMaterias(cursoAlumno) {
    const { data: materias } = await window.supabaseCliente.from('materias').select('*').eq('curso', cursoAlumno).order('nombre_materia');
    const optionsHTML = (materias || []).map(m => `<option value="${m.nombre_materia}">${m.nombre_materia.toUpperCase()} (${m.siglas})</option>`).join('');
    
    document.querySelectorAll(".select-materias-autocompletar").forEach(select => {
        select.innerHTML = optionsHTML || `<option value="">-- No hay materias en este curso --</option>`;
    });
}

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

async function inicializarAutocompletarMaterias(curso) {
    // Esta función también la busca el botón Gestionar para los desplegables
    console.log("Inicializando autocompletado para el curso:", curso);
}

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
    console.log("Cargando lista de materias para autocompletar...");
    
    const selectIntMateria = document.getElementById("int-materia");
    const selectRecMateria = document.getElementById("rec-materia");

    try {
        // Traemos absolutamente todas las materias cargadas por el admin
        const { data: materias, error } = await window.supabaseCliente
            .from('materias')
            .select('*')
            .order('nombre_materia');

        if (error) throw error;

        if (materias && materias.length > 0) {
            // Generamos las opciones del select en MAYÚSCULAS mostrando a qué curso pertenecen
            const opcionesHTML = materias.map(m => 
                `<option value="${m.nombre_materia.toUpperCase()}">${m.nombre_materia.toUpperCase()} (${m.curso})</option>`
            ).join('');
            
            // Inyectamos las opciones y nos aseguramos de que no queden bloqueados
            if (selectIntMateria) {
                selectIntMateria.innerHTML = opcionesHTML;
                selectIntMateria.disabled = false; 
            }
            if (selectRecMateria) {
                selectRecMateria.innerHTML = opcionesHTML;
                selectRecMateria.disabled = false;
            }
        } else {
            // Si el admin no creó materias en el sistema
            const opcionVacia = `<option value="">-- No hay materias dadas de alta --</option>`;
            if (selectIntMateria) selectIntMateria.innerHTML = opcionVacia;
            if (selectRecMateria) selectRecMateria.innerHTML = opcionVacia;
        }

    } catch (err) {
        console.error("Error al poblar los selectores de materias:", err.message);
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

window.procesarAltaIntensificacion = async function(event) {
    event.preventDefault();
    if (!alumnoSeleccionadoId) return alert("Primero debés seleccionar un alumno.");

    const mat = document.getElementById("int-materia").value;
    const destino = document.getElementById("int-materia-destino").value.trim();
    const d1 = document.getElementById("int-dia").value;
    const h1 = document.getElementById("int-horario").value;
    const d2 = document.getElementById("int-dia-2").value;
    const h2 = document.getElementById("int-horario-2").value;

    // Armamos la cadena solo con los días y horarios reales, quitando la palabra "Asignado"
    let detalleHorario = `${d1} de ${h1}`;
    if (d2 && h2) {
        detalleHorario += ` y ${d2} de ${h2}`;
    }

    // Guardamos la materia de destino dentro de la descripción o en una nota aclaratoria limpia
    const descripcionFinal = `Intensifica en: ${destino}`;

    try {
        const { error } = await window.supabaseCliente
            .from('intensificaciones')
            .insert([
                { 
                    estudiante_id: alumnoSeleccionadoId, 
                    materia: mat, 
                    dia: descripcionFinal, // Guardamos aquí la materia destino para no romper la estructura de tablas
                    horario: detalleHorario 
                }
            ]);

        if (error) throw error;

        alert("¡Materia a intensificar guardada con éxito!");
        document.getElementById("form-intensificar").reset();
        cargarIntensificacionesEdicion(); // Forzamos el renderizado del botón eliminar

    } catch (err) {
        console.error(err);
        alert("Error al guardar en Supabase.");
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

