const pool = require('../config/db');

const obtenerAlcancias = async (req, res) =>{
    try {
        const { comunidad_id } = req.params;
        // Solo se pueden ver las alcancías de la comunidad a la que pertenece el usuario
        if (Number(comunidad_id) !== req.comunidadId) {
            return res.status(403).json({ error: 'No tienes acceso a esta comunidad' });
        }
        const resultado = await pool.query('SELECT * FROM alcancias WHERE comunidad_id = $1 ORDER BY codigo_alcancia ASC', [comunidad_id]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error('Error obteniendo alcancías:', error);
        res.status(500).json({ error: 'Hubo un error al obtener los datos' });
    }
}
const crearAlcancia = async (req, res) => {
  const { codigo_alcancia, nombre_persona, colocada, devuelta, faltante, monto_entregado } = req.body;
  // La comunidad y el usuario salen de la sesión, no del body
  const comunidad_id = req.comunidadId;
  const usuario_id = req.usuario.id;

  const anioActual = new Date().getFullYear();

  try {
    const nuevaAlcancia = await pool.query(
      `INSERT INTO alcancias 
      (codigo_alcancia, nombre_persona, comunidad_id, usuario_id, colocada, devuelta, faltante, monto_entregado, anio) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [codigo_alcancia, nombre_persona, comunidad_id, usuario_id, colocada, devuelta, faltante, monto_entregado, anioActual]
    );

    res.json(nuevaAlcancia.rows[0]);
  } catch (error) {
    console.error('Error guardando alcancía:', error);
    res.status(500).json({ error: 'Hubo un error al guardar' });
  }
};

const actualizarAlcancia = async (req, res) => {
  const { codigo } = req.params;

  const { colocada, devuelta, faltante, monto_entregado } = req.body;

  try {
    const alcanciaActualizada = await pool.query(
      `UPDATE alcancias 
       SET colocada = $1, 
           devuelta = $2, 
           faltante = $3, 
           monto_entregado = $4 
       WHERE codigo_alcancia = $5 AND comunidad_id = $6
       RETURNING *`,
       [colocada, devuelta, faltante, monto_entregado, codigo, req.comunidadId]
    );
    // Verificamos si realmente se encontró y actualizó la alcancía (en la comunidad del usuario)
    if (alcanciaActualizada.rows.length === 0) {
      return res.status(404).json({ error: 'Alcancía no encontrada' });
    }

    res.status(200).json(alcanciaActualizada.rows[0]);
  } catch (error) {
    console.error('Error actualizando alcancía:', error);
    res.status(500).json({ error: 'Hubo un error al actualizar' });
  }
}
const obtenerSiguienteAlcancia = async (req, res) => {
  const { comunidad_id } = req.params;

  if (Number(comunidad_id) !== req.comunidadId) {
    return res.status(403).json({ error: 'No tienes acceso a esta comunidad' });
  }

  try {
    // 1. Obtener los rangos de la comunidad
    const comunidadRes = await pool.query(
      'SELECT rango_inicio, rango_fin FROM comunidades WHERE id = $1', 
      [comunidad_id]
    );

    if (comunidadRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    const { rango_inicio, rango_fin } = comunidadRes.rows[0];

    // 2. Buscar el número de alcancía más alto registrado para esta comunidad
    const ultimaAlcanciaRes = await pool.query(
      'SELECT MAX(codigo_alcancia) as ultima FROM alcancias WHERE comunidad_id = $1',
      [comunidad_id]
    );

    let siguienteCodigo = rango_inicio; // Por defecto es el rango de inicio

    // Si ya hay alcancías registradas, le sumamos 1 a la última
    if (ultimaAlcanciaRes.rows[0].ultima) {
      siguienteCodigo = parseInt(ultimaAlcanciaRes.rows[0].ultima, 10) + 1;
    }

    // 3. Verificar si ya se llenó el sector
    if (siguienteCodigo > rango_fin) {
      return res.json({ 
        limite_alcanzado: true, 
        mensaje: 'Se ha alcanzado el límite de alcancías para este sector.',
        rango_inicio,
        rango_fin
      });
    }

    // 4. Devolver el siguiente código listo para usarse
    res.json({
      limite_alcanzado: false,
      siguiente_codigo: siguienteCodigo,
      rango_inicio,
      rango_fin: rango_fin
    });

  } catch (error) {
    console.error('Error al obtener siguiente alcancía:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const sincronizarAlcanciasOffline = async (req, res) => {
  const { alcancias } = req.body;

  if(!alcancias || !Array.isArray(alcancias) || alcancias.length === 0){
    return res.status(400).json({error: 'No se recibieron datos para sincronizar'})
  }

  // Todo el lote va en una sola transacción: o se guardan todas o ninguna,
  // así un reintento del teléfono no deja registros a medias
  let client;
  try {
    client = await pool.connect();
    let insertadas = 0;
    let omitidas = 0;
    let rechazadas = 0;
    // Alcancías que el teléfono NO debe marcar como subidas: número repetido o fuera de rango
    const conflictos = [];
    const anioActual = new Date().getFullYear();

    const { rows: [rango] } = await client.query(
      'SELECT rango_inicio, rango_fin FROM comunidades WHERE id = $1',
      [req.comunidadId]
    );

    await client.query('BEGIN');

    for (const alcancia of alcancias){
      // Solo se aceptan alcancías de la comunidad del usuario que sincroniza
      if (Number(alcancia.comunidad_id) !== req.comunidadId) {
        rechazadas++;
        continue;
      }

      const codigo = Number(alcancia.codigo_alcancia);
      if (rango && rango.rango_inicio != null && rango.rango_fin != null &&
          (codigo < Number(rango.rango_inicio) || codigo > Number(rango.rango_fin))) {
        conflictos.push({
          local_id: alcancia.local_id,
          codigo_alcancia: codigo,
          motivo: 'fuera_de_rango',
          mensaje: `El número ${codigo} no está en el rango de la comunidad (${rango.rango_inicio} a ${rango.rango_fin}).`
        });
        continue;
      }

      // Si la alcancía ya existe no se vuelve a insertar
      const resultado = await client.query(
                `INSERT INTO alcancias
                (codigo_alcancia, nombre_persona, comunidad_id, usuario_id, colocada, devuelta, faltante, monto_entregado, anio)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
                WHERE NOT EXISTS (
                  SELECT 1 FROM alcancias WHERE codigo_alcancia = $1 AND comunidad_id = $3
                )`,
                [
                    alcancia.codigo_alcancia,
                    alcancia.nombre_persona,
                    req.comunidadId,
                    req.usuario.id,                  // Quien sincroniza es quien las registró
                    Boolean(alcancia.colocada),      // El teléfono manda 0/1 desde SQLite
                    Boolean(alcancia.devuelta),
                    Boolean(alcancia.faltante),
                    alcancia.monto_entregado ?? null,
                    alcancia.anio || anioActual
                ]
            );
      if (resultado.rowCount === 1) {
        insertadas++;
        continue;
      }

      // Ya existía: ¿es un reintento del mismo registro o lo registró otra persona?
      const { rows: [existente] } = await client.query(
        `SELECT a.usuario_id, a.nombre_persona, u.nombre AS registrada_por
         FROM alcancias a LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.codigo_alcancia = $1 AND a.comunidad_id = $2`,
        [codigo, req.comunidadId]
      );

      const esReintento = existente &&
        Number(existente.usuario_id) === Number(req.usuario.id) &&
        existente.nombre_persona === alcancia.nombre_persona;

      if (esReintento) {
        omitidas++;
      } else {
        conflictos.push({
          local_id: alcancia.local_id,
          codigo_alcancia: codigo,
          motivo: 'repetido',
          mensaje: `La alcancía #${codigo} ya fue registrada${existente?.registrada_por ? ` por ${existente.registrada_por}` : ''} a nombre de ${existente?.nombre_persona || 'otra persona'}.`
        });
      }
    }

    await client.query('COMMIT');
    res.status(200).json({
      mensaje: 'Sincronización exitosa',
      total_sincronizadas: insertadas,
      total_omitidas: omitidas,
      total_rechazadas: rechazadas,
      conflictos
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error en sincronización masiva:', error);
     res.status(500).json({ error: 'Error interno al sincronizar los registros' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  obtenerAlcancias,
  crearAlcancia,
  actualizarAlcancia,
  obtenerSiguienteAlcancia,
  sincronizarAlcanciasOffline
};
