document.addEventListener("DOMContentLoaded", () => {
    const btnMostrarLogin = document.getElementById("btn-mostrar-login");
    const seccionLoginPersonal = document.getElementById("seccion-login-personal");
    const formLoginPersonal = document.getElementById("form-login-personal");
    const mensajeErrorPersonal = document.getElementById("mensaje-error-personal");

    // Si venimos de un cierre de sesión automático (por inactividad, o por haber
    // usado atrás/adelante del navegador -- ver panel.js), abrimos directamente
    // el formulario de acceso del personal y mostramos el motivo, para que no
    // parezca que la sesión "se perdió" sin explicación.
    const parametros = new URLSearchParams(window.location.search);
    const motivo = parametros.get("motivo");
    if (seccionLoginPersonal && mensajeErrorPersonal) {
        if (motivo === "inactividad") {
            seccionLoginPersonal.classList.remove("oculto");
            mensajeErrorPersonal.textContent = "Tu sesión se cerró automáticamente por inactividad. Volvé a ingresar tus datos.";
        } else if (motivo === "navegacion") {
            seccionLoginPersonal.classList.remove("oculto");
            mensajeErrorPersonal.textContent = "Por seguridad, volvé a ingresar tus datos para continuar.";
        }
    }

    if (btnMostrarLogin && seccionLoginPersonal) {
        // Mostrar u ocultar el formulario de login al hacer clic en el botón
        btnMostrarLogin.addEventListener("click", () => {
            seccionLoginPersonal.classList.toggle("oculto");
        });
    }

    if (formLoginPersonal) {
        // Lógica para el inicio de sesión de Preceptoras/Admin
        formLoginPersonal.addEventListener("submit", async (e) => {
            e.preventDefault();
            mensajeErrorPersonal.textContent = ""; // Limpiar errores previos

            const email = document.getElementById("email-personal").value.trim();
            const password = document.getElementById("password-personal").value;

            try {
                // CAMBIADO: Usamos 'supabaseCliente' para iniciar sesión
                const { data, error } = await supabaseCliente.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) {
                    mensajeErrorPersonal.textContent = "Error: Credenciales incorrectas.";
                    console.error("Error de autenticación:", error.message);
                    return;
                }

                const usuarioId = data.user.id;
                
                // CAMBIADO: Usamos 'supabaseCliente' para consultar el rol en tu tabla espejo
                const { data: perfil, error: errorPerfil } = await supabaseCliente
                    .from('perfiles_personal')
                    .select('rol')
                    .eq('id', usuarioId)
                    .maybeSingle();

                if (errorPerfil || !perfil) {
                    mensajeErrorPersonal.textContent = "Usuario autenticado, pero no se encontró un rol asignado en perfiles_personal.";
                    console.error("Error de perfil:", errorPerfil);
                    return;
                }

                // Guardamos el rol en el almacenamiento local del navegador
                localStorage.setItem("user_rol", perfil.rol);
                
                // Redireccionamos al panel de control administrativo
                window.location.href = "panel.html";

            } catch (err) {
                console.error("Error inesperado en login:", err);
                mensajeErrorPersonal.textContent = "Ocurrió un error al intentar conectar con el servidor.";
            }
        });
    }
});
