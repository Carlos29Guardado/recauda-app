const pool = require('../config/db');

const obtenerAlcancias = async (req, res) =>{
    try {
        const { comunidad_id } = req.params;
        const resultado = await pool.query('SELECT * FROM alcancias WHERE comunidad_id = $1 ORDER BY codigo_alcancia ASC', [comunidad_id]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error('Error obteniendo alcancías:', error);
        res.status(500).json({ error: 'Hubo un error al obtener los datos' });
    }
}
const crearAlcancia = async (req, res) => {
  const { codigo_alcancia, nombre_persona, comunidad_id, usuario_id, colocada, devuelta, faltante, monto_entregado } = req.body;
  
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
       WHERE codigo_alcancia = $5 
       RETURNING *`,
       [colocada, devuelta, faltante, monto_entregado, codigo]
    );
    // Verificamos si realmente se encontró y actualizó la alcancía
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
        rango_fin 
      });
    }

    // 4. Devolver el siguiente código listo para usarse
    res.json({
      limite_alcanzado: false,
      siguiente_codigo: siguienteCodigo,
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

  try {
    let insertadas = 0;
    const anioActual = new Date().getFullYear();

    for (const alcancia of alcancias){
      await pool.query(
                `INSERT INTO alcancias 
                (codigo_alcancia, nombre_persona, comunidad_id, usuario_id, colocada, devuelta, faltante, monto_entregado, anio) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    alcancia.codigo_alcancia,
                    alcancia.nombre_persona,
                    alcancia.comunidad_id,
                    alcancia.usuario_id,
                    alcancia.colocada || false,      // Valores por defecto de seguridad
                    alcancia.devuelta || false,
                    alcancia.faltante || false,
                    alcancia.monto_entregado || 0,
                    anioActual
                ]
            );
            insertadas++;
    }
    res.status(200).json({
      mensaje: 'Sincronización exitosa',
      total_sincronizadas: insertadas
    });
  } catch (error) {
    console.error('Error en sincronización masiva:', error);
     res.status(500).json({ error: 'Error interno al sincronizar los registros' });
  }
}

module.exports = {
  obtenerAlcancias,
  crearAlcancia,
  actualizarAlcancia,
  obtenerSiguienteAlcancia,
  sincronizarAlcanciasOffline
};
