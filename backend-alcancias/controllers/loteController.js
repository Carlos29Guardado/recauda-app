const pool = require('../config/db');

// Lotes de alcancías: cada colaborador recibe uno o varios rangos de números exclusivos
// (por ejemplo 5073 a 5091). Así, aunque trabajen sin internet, nunca se repiten números.

// Lista los miembros de la comunidad con sus lotes y cuántos números de cada lote ya se usaron (solo admin)
const listarLotes = async (req, res) => {
    try {
        const { rows: [comunidad] } = await pool.query(
            'SELECT rango_inicio, rango_fin FROM comunidades WHERE id = $1',
            [req.comunidadId]
        );

        const { rows: miembros } = await pool.query(
            `SELECT id, nombre, email, rol
             FROM usuarios
             WHERE comunidad_id = $1
             ORDER BY CASE WHEN rol = 'admin' THEN 0 ELSE 1 END, nombre ASC`,
            [req.comunidadId]
        );

        const { rows: lotes } = await pool.query(
            `SELECT l.id, l.usuario_id, l.rango_inicio, l.rango_fin,
                    (SELECT COUNT(*) FROM alcancias a
                     WHERE a.comunidad_id = l.comunidad_id
                       AND a.codigo_alcancia BETWEEN l.rango_inicio AND l.rango_fin) AS usados
             FROM lotes l
             WHERE l.comunidad_id = $1
             ORDER BY l.rango_inicio ASC`,
            [req.comunidadId]
        );

        res.status(200).json({
            rango_inicio: comunidad?.rango_inicio ?? null,
            rango_fin: comunidad?.rango_fin ?? null,
            miembros: miembros.map((m) => ({
                ...m,
                lotes: lotes
                    .filter((l) => Number(l.usuario_id) === Number(m.id))
                    .map((l) => ({
                        id: l.id,
                        rango_inicio: l.rango_inicio,
                        rango_fin: l.rango_fin,
                        total: l.rango_fin - l.rango_inicio + 1,
                        usados: Number(l.usados)
                    }))
            }))
        });
    } catch (error) {
        console.error('Error al listar lotes:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Asigna un lote nuevo a un miembro de la comunidad (solo admin)
const crearLote = async (req, res) => {
    const usuarioId = Number(req.body.usuario_id);
    const inicio = Number(req.body.rango_inicio);
    const fin = Number(req.body.rango_fin);

    if (!Number.isInteger(usuarioId) || !Number.isInteger(inicio) || !Number.isInteger(fin)) {
        return res.status(400).json({ mensaje: 'Indica el colaborador y el primer y último número del lote.' });
    }
    if (inicio > fin) {
        return res.status(400).json({ mensaje: 'El primer número no puede ser mayor que el último.' });
    }

    try {
        // El colaborador debe pertenecer a la comunidad del admin
        const { rows: [miembro] } = await pool.query(
            'SELECT id, nombre FROM usuarios WHERE id = $1 AND comunidad_id = $2',
            [usuarioId, req.comunidadId]
        );
        if (!miembro) {
            return res.status(404).json({ mensaje: 'Ese colaborador no pertenece a tu comunidad.' });
        }

        // El lote debe estar dentro del rango de alcancías de la comunidad
        const { rows: [comunidad] } = await pool.query(
            'SELECT rango_inicio, rango_fin FROM comunidades WHERE id = $1',
            [req.comunidadId]
        );
        if (comunidad?.rango_inicio != null && comunidad?.rango_fin != null &&
            (inicio < Number(comunidad.rango_inicio) || fin > Number(comunidad.rango_fin))) {
            return res.status(400).json({
                mensaje: `El lote debe estar dentro del rango de la comunidad (${comunidad.rango_inicio} a ${comunidad.rango_fin}).`
            });
        }

        // No puede encimarse con otro lote de la comunidad
        const { rows: [encimado] } = await pool.query(
            `SELECT l.rango_inicio, l.rango_fin, u.nombre
             FROM lotes l LEFT JOIN usuarios u ON u.id = l.usuario_id
             WHERE l.comunidad_id = $1 AND l.rango_inicio <= $3 AND l.rango_fin >= $2
             LIMIT 1`,
            [req.comunidadId, inicio, fin]
        );
        if (encimado) {
            return res.status(409).json({
                mensaje: `Se encima con el lote ${encimado.rango_inicio} a ${encimado.rango_fin}${encimado.nombre ? ` de ${encimado.nombre}` : ''}.`
            });
        }

        const { rows: [lote] } = await pool.query(
            `INSERT INTO lotes (comunidad_id, usuario_id, rango_inicio, rango_fin)
             VALUES ($1, $2, $3, $4)
             RETURNING id, usuario_id, rango_inicio, rango_fin`,
            [req.comunidadId, usuarioId, inicio, fin]
        );

        res.status(201).json({ mensaje: `Lote asignado a ${miembro.nombre}`, lote });
    } catch (error) {
        console.error('Error al crear lote:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Borra un lote que todavía no tiene alcancías registradas (solo admin)
const eliminarLote = async (req, res) => {
    const loteId = Number(req.params.id);

    try {
        const { rows: [lote] } = await pool.query(
            'SELECT id, rango_inicio, rango_fin FROM lotes WHERE id = $1 AND comunidad_id = $2',
            [loteId, req.comunidadId]
        );
        if (!lote) {
            return res.status(404).json({ mensaje: 'Lote no encontrado.' });
        }

        const { rows: [uso] } = await pool.query(
            `SELECT COUNT(*) AS usados FROM alcancias
             WHERE comunidad_id = $1 AND codigo_alcancia BETWEEN $2 AND $3`,
            [req.comunidadId, lote.rango_inicio, lote.rango_fin]
        );
        if (Number(uso.usados) > 0) {
            return res.status(409).json({
                mensaje: `No se puede borrar: ya hay ${uso.usados} alcancías registradas con números de este lote.`
            });
        }

        await pool.query('DELETE FROM lotes WHERE id = $1', [loteId]);
        res.status(200).json({ mensaje: 'Lote eliminado' });
    } catch (error) {
        console.error('Error al eliminar lote:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Lotes del usuario que consulta (cualquier miembro). La app los guarda para asignar números sin internet.
// - usa_lotes: si la comunidad ya trabaja con lotes (entonces sin lote no se puede registrar)
// - usados: números de sus lotes que ya están registrados en el servidor
const misLotes = async (req, res) => {
    try {
        const { rows: [conteo] } = await pool.query(
            'SELECT COUNT(*) AS total FROM lotes WHERE comunidad_id = $1',
            [req.comunidadId]
        );

        const { rows: lotes } = await pool.query(
            `SELECT id, rango_inicio, rango_fin FROM lotes
             WHERE comunidad_id = $1 AND usuario_id = $2
             ORDER BY rango_inicio ASC`,
            [req.comunidadId, req.usuario.id]
        );

        const { rows: usados } = await pool.query(
            `SELECT a.codigo_alcancia FROM alcancias a
             JOIN lotes l ON l.comunidad_id = a.comunidad_id
                         AND a.codigo_alcancia BETWEEN l.rango_inicio AND l.rango_fin
             WHERE a.comunidad_id = $1 AND l.usuario_id = $2`,
            [req.comunidadId, req.usuario.id]
        );

        res.status(200).json({
            usa_lotes: Number(conteo.total) > 0,
            lotes,
            usados: usados.map((u) => Number(u.codigo_alcancia))
        });
    } catch (error) {
        console.error('Error al obtener mis lotes:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { listarLotes, crearLote, eliminarLote, misLotes };
