const pool = require('../config/db');

const crearComunidad = async (req, res) => {
    const {nombre, emailUsuario, rango_inicio, rango_fin} = req.body;

    //Genera un código aleatorio de 6 caracteres
    const codigoInvitacion = Math.random().toString(36).substring(2,8).toUpperCase();

    try {
        await pool.query('BEGIN');

        //Crear comunidad
        const resultComunidad = await pool.query(
            'INSERT INTO comunidades (nombre, codigo_invitacion, rango_inicio, rango_fin) VALUES ($1, $2, $3, $4) RETURNING id, codigo_invitacion',
            [nombre, codigoInvitacion, rango_inicio, rango_fin]
        );
        const nuevaComunidadId = resultComunidad.rows[0].id;

        //Hacer administrador al creador
        await pool.query(
            "UPDATE usuarios SET comunidad_id = $1, rol = 'admin' WHERE email = $2",
            [nuevaComunidadId, emailUsuario]
        );
        await pool.query('COMMIT'); // Confirma cambios

        res.status(201).json({ 
            mensaje: 'Comunidad creada exitosamente',
            codigo_invitacion: codigoInvitacion,
            comunidad_id: nuevaComunidadId
        });
    } catch (error) {
        await pool.query('ROLLBACK'); // Deshace si hay error
        console.error('Error al crear comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
}
const unirseComunidad = async (req, res) => {
    const { codigo_invitacion, emailUsuario } = req.body; 

    try {
        // Buscar la comunidad por código
        const resultComunidad = await pool.query(
            'SELECT id, nombre, activa FROM comunidades WHERE codigo_invitacion = $1',
            [codigo_invitacion]
        );

        if (resultComunidad.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Código de verificación inválido o no existe.' });
        }

        const comunidadEncontrada = resultComunidad.rows[0];

        // A una comunidad cerrada ya no se puede unir nadie
        if (comunidadEncontrada.activa === false) {
            return res.status(403).json({ mensaje: 'Esta comunidad está cerrada: su campaña ya terminó.' });
        }

        // Asignar el usuario a la comunidad como colaborador
        await pool.query(
            "UPDATE usuarios SET comunidad_id = $1, rol = 'colaborador' WHERE email = $2",
            [comunidadEncontrada.id, emailUsuario]
        );

        res.status(200).json({ 
            mensaje: 'Te has unido exitosamente',
            comunidad_id: comunidadEncontrada.id,
            comunidad_nombre: comunidadEncontrada.nombre
        });

    } catch (error) {
        console.error('Error al unirse a la comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

const obtenerUsuariosComunidad = async (req, res) => {
    try {
        // El token del login manual solo trae id y email, y el rol/comunidad pueden
        // haber cambiado después del login, así que se consultan en la base de datos
        const resultSolicitante = await pool.query(
            'SELECT comunidad_id, rol FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );

        const solicitante = resultSolicitante.rows[0];

        if (!solicitante || !solicitante.comunidad_id) {
            return res.status(404).json({ mensaje: 'No perteneces a ninguna comunidad.' });
        }

        if (solicitante.rol !== 'admin') {
            return res.status(403).json({ mensaje: 'Solo el administrador puede ver los usuarios de la comunidad.' });
        }

        // Primero el administrador y después los colaboradores, ordenados por nombre
        const resultUsuarios = await pool.query(
            `SELECT id, nombre, email, rol
             FROM usuarios
             WHERE comunidad_id = $1
             ORDER BY CASE WHEN rol = 'admin' THEN 0 ELSE 1 END, nombre ASC`,
            [solicitante.comunidad_id]
        );

        res.status(200).json(resultUsuarios.rows);
    } catch (error) {
        console.error('Error al obtener usuarios de la comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Genera un código de invitación de 6 caracteres que no esté usado por otra comunidad
const generarCodigoUnico = async () => {
    for (let intento = 0; intento < 10; intento++) {
        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { rows } = await pool.query('SELECT 1 FROM comunidades WHERE codigo_invitacion = $1', [codigo]);
        if (rows.length === 0 && codigo.length === 6) return codigo;
    }
    throw new Error('No se pudo generar un código de invitación único');
};

// Datos de la comunidad para la pantalla "Administrar comunidad" (solo admin)
const obtenerDetalleComunidad = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.nombre, c.codigo_invitacion, c.rango_inicio, c.rango_fin, c.activa, c.fecha_cierre,
                    (SELECT COUNT(*) FROM usuarios u WHERE u.comunidad_id = c.id) AS total_miembros,
                    (SELECT COUNT(*) FROM alcancias a WHERE a.comunidad_id = c.id) AS total_alcancias
             FROM comunidades c
             WHERE c.id = $1`,
            [req.comunidadId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Comunidad no encontrada.' });
        }

        const c = rows[0];
        res.status(200).json({
            id: c.id,
            nombre: c.nombre,
            codigo_invitacion: c.codigo_invitacion,
            rango_inicio: c.rango_inicio,
            rango_fin: c.rango_fin,
            total_miembros: Number(c.total_miembros),
            total_alcancias: Number(c.total_alcancias),
            activa: c.activa !== false,
            fecha_cierre: c.fecha_cierre
        });
    } catch (error) {
        console.error('Error al obtener detalle de la comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Cambia el nombre de la comunidad (solo admin)
const cambiarNombreComunidad = async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();

    if (nombre.length < 3 || nombre.length > 60) {
        return res.status(400).json({ mensaje: 'El nombre debe tener entre 3 y 60 caracteres.' });
    }

    try {
        const { rows } = await pool.query(
            'UPDATE comunidades SET nombre = $1 WHERE id = $2 RETURNING nombre',
            [nombre, req.comunidadId]
        );
        res.status(200).json({ mensaje: 'Nombre actualizado', nombre: rows[0].nombre });
    } catch (error) {
        console.error('Error al cambiar el nombre de la comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Genera un código de invitación nuevo; el anterior deja de funcionar (solo admin)
const regenerarCodigoInvitacion = async (req, res) => {
    try {
        const codigo = await generarCodigoUnico();
        await pool.query(
            'UPDATE comunidades SET codigo_invitacion = $1 WHERE id = $2',
            [codigo, req.comunidadId]
        );
        res.status(200).json({ mensaje: 'Código actualizado', codigo_invitacion: codigo });
    } catch (error) {
        console.error('Error al regenerar el código de invitación:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Estado de la comunidad para cualquier miembro: la app lo usa para saber si está cerrada
const obtenerEstadoComunidad = (req, res) => {
    res.status(200).json({ activa: req.comunidadActiva });
};

// Cierra (campaña finalizada) o reabre la comunidad (solo admin)
const cambiarEstadoComunidad = async (req, res) => {
    if (typeof req.body.activa !== 'boolean') {
        return res.status(400).json({ mensaje: 'Indica si la comunidad queda activa (true) o cerrada (false).' });
    }
    const activa = req.body.activa;

    try {
        const { rows } = await pool.query(
            `UPDATE comunidades
             SET activa = $1, fecha_cierre = CASE WHEN $1 THEN NULL ELSE NOW() END
             WHERE id = $2
             RETURNING activa, fecha_cierre`,
            [activa, req.comunidadId]
        );
        res.status(200).json({
            mensaje: activa ? 'Comunidad reabierta' : 'Comunidad cerrada',
            activa: rows[0].activa,
            fecha_cierre: rows[0].fecha_cierre
        });
    } catch (error) {
        console.error('Error al cambiar el estado de la comunidad:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = {
    obtenerEstadoComunidad,
    cambiarEstadoComunidad,
    crearComunidad,
    unirseComunidad,
    obtenerUsuariosComunidad,
    obtenerDetalleComunidad,
    cambiarNombreComunidad,
    regenerarCodigoInvitacion
};