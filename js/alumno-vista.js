document.addEventListener("DOMContentLoaded", async () => {
    // 1. Obtener el DNI desde los parámetros de la URL
    const parametros = new URLSearchParams(window.location.search);
    const dniEstudiante = parametros.get("dni");

    if (!dniEstudiante) {
        alert("Acceso denegado. No se especificó el DNI.");
        window.location.href = "index.html";
        return;
    }

    try {
        // 2. Buscar los datos básicos del alumno
        const { data: alumno, error: errAlumno } = await supabaseCliente
            .from('estudiantes')
            .select('*')
            .eq('dni', dniEstudiante)
            .single();

        if (errAlumno || !alumno) {
            alert("Estudiante no encontrado.");
            window.location.href = "index.html";
            return;
        }

        // Renderizar datos del encabezado
        document.getElementById("nombre-alumno").textContent = `${alumno.apellido}, ${alumno.nombre}`;
        document.getElementById("curso-alumno").textContent = `Curso Actual: ${alumno.curso_actual}`;
        document.getElementById("dni-visual").textContent = `DNI: ${alumno.dni}`;
        if(alumno.observaciones) {
            document.getElementById("texto-observaciones").textContent = alumno.observaciones;
        }

        const estudianteId = alumno.id;

        // 3. Consultar intensificaciones, recursadas y boletín de forma simultánea
        const [resIntensifica, resRecursadas, resBoletin] = await Promise.all([
           supabaseCliente.from('intensificaciones').select('*').eq('estudiante_id', estudianteId),
            supabaseCliente.from('recursadas').select('*').eq('estudiante_id', estudianteId),
           supabaseCliente.from('boletines').select('*, materias(nombre_materia)').eq('estudiante_id', estudianteId)
        ]);

        // --- Renderizar Intensificaciones ---
         const contenedorInten = document.getElementById("lista-intensificaciones");
        if (resIntensifica.data && resIntensifica.data.length > 0) {
            contenedorInten.innerHTML = resIntensifica.data.map(i => {
                // Removemos la palabra fija "Horario:" y unimos las dos partes de forma limpia
                // i.dia ya contiene la cadena "Intensifica en: MATERIA (CURSO)"
                // i.horario contiene "Lunes de 7:30 a 9:30 y Martes de 9:50 a 11:50"
                return `
                    <div class="elemento-lista">
                        <strong>${i.materia.toUpperCase()}</strong> — ${i.dia} de ${i.horario}
                    </div>
                `;
            }).join('');
        } else {
            contenedorInten.textContent = "No registra materias a intensificar de 2025.";
        }

        // --- Renderizar Recursadas ---
        const contenedorRecur = document.getElementById("lista-recursadas");
        if (resRecursadas.data && resRecursadas.data.length > 0) {
            contenedorRecur.innerHTML = resRecursadas.data.map(r => {
                // Limpiamos los textos redundantes si se cargaron con la palabra 'Asignado' en la base de datos
                let horarioLimpio = r.horario || '';
                horarioLimpio = horarioLimpio.replace("(Asignado - ", "(").replace("Asignado - ", "");

                // Formateamos para que diga exactamente: MATERIA en CURSO (HORARIO)
                return `
                    <div class="elemento-lista">
                        <strong>${r.materia.toUpperCase()}</strong> en <b>${r.curso_recursada}</b> (${horarioLimpio})
                    </div>
                `;
            }).join('');
        } else {
            contenedorRecur.textContent = "No registra materias cursadas en otros años.";
        }

        // --- Renderizar Boletín ---
               // --- Renderizar Boletín (Actualizado) ---
        const cuerpoBoletin = document.getElementById("cuerpo-boletin");
        
        // Cambio 1: Modificar dinámicamente el título del boletín con el curso y año
        const anioActual = new Date().getFullYear();
        const tituloBoletin = document.querySelector(".tarjeta-boletin h2");
        if (tituloBoletin) {
            tituloBoletin.textContent = `📊 Boletín de Calificaciones Actual — ${alumno.curso_actual} (${anioActual})`;
        }

        if (resBoletin.data && resBoletin.data.length > 0) {
            cuerpoBoletin.innerHTML = resBoletin.data.map(b => {
                const claseInf1 = b.primer_informe === 'TEA' ? 'valorativo-tea' : b.primer_informe === 'TEP' ? 'valorativo-tep' : b.primer_informe === 'TED' ? 'valorativo-ted' : '';
                const claseInf2 = b.segundo_informe === 'TEA' ? 'valorativo-tea' : b.segundo_informe === 'TEP' ? 'valorativo-tep' : b.segundo_informe === 'TED' ? 'valorativo-ted' : '';
                
                // Forzar el nombre de la materia a MAYÚSCULAS
                const nombreMateriaMayuscula = (b.materias?.nombre_materia || 'Materia sin nombre').toUpperCase();
                
                return `
                    <tr>
                        <td style="text-align: left; font-weight: 600;">${nombreMateriaMayuscula}</td>
                        <td class="${claseInf1}">${b.primer_informe || '-'}</td>
                        <td><b>${b.primer_cuatrimestre ?? '-'}</b></td>
                        <td class="${claseInf2}">${b.segundo_informe || '-'}</td>
                        <td><b>${b.segundo_cuatrimestre ?? '-'}</b></td>
                        <td><strong>${b.nota_anual ?? '-'}</strong></td>
                        <td><span class="nota-final-destacada">${b.nota_final ?? '-'}</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            cuerpoBoletin.innerHTML = `<tr><td colspan="7" class="text-center">No hay materias cargadas para este curso en el ciclo actual.</td></tr>`;
        }


    } catch (error) {
        console.error("Error cargando la trayectoria:", error);
        alert("Ocurrió un inconveniente al conectar con los servidores.");
    }
});


