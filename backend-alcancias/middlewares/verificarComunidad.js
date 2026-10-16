const pool = require('../config/db');

// Carga la comunidad y el rol ACTUALES del usuario desde la base de datos.
// El token del login manual solo trae id y email, y la comunidad puede cambiar
// después del login (crear o unirse), así que no se toman del token.
const verificarComunidad = async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            'SELECT comunidad_id, rol FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );

        if (rows.length === 0 || !rows[0].comunidad_id) {
            return res.status(403).json({ error: 'No perteneces a ninguna comunidad.' });
        }

        req.comunidadId = Number(rows[0].comunidad_id);
        req.rolActual = rows[0].rol;
        next();
    } catch (error) {
        console.error('Error verificando la comunidad del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

module.exports = { verificarComunidad };
