document.addEventListener("DOMContentLoaded", () => {
    const formConsulta = document.getElementById("form-consulta-alumno");
    const mensajeError = document.getElementById("mensaje-error-alumno");

    if (formConsulta) {
        formConsulta.addEventListener("submit", async (e) => {
            e.preventDefault();
            mensajeError.textContent = ""; // Limpiar errores

            const dniBuscado = document.getElementById("dni-alumno").value.trim();

            try {
                // Hacemos una consulta rápida a Supabase solo para verificar si el DNI existe
                const { data: estudiante, error } = await supabaseCliente                
                    .from('estudiantes')
                    .select('dni')
                    .eq('dni', dniBuscado)
                    .maybeSingle(); // Trae un solo registro o null si no existe

                if (error) throw error;

                if (!estudiante) {
                    mensajeError.textContent = "El DNI ingresado no corresponde a ningún estudiante registrado.";
                    return;
                }

                // Si el estudiante existe, lo redirigimos a la pantalla de trayectorias
                // Pasamos el DNI por la URL (?dni=12345678) para leerlo en la siguiente página
                window.location.href = `alumno.html?dni=${dniBuscado}`;

            } catch (err) {
                console.error("Error al consultar el alumno:", err.message);
                mensajeError.textContent = "Ocurrió un error en el servidor. Intente más tarde.";
            }
        });
    }
});
