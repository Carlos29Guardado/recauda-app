import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const db = SQLite.openDatabaseSync('recauda_offline.db');

export const createTables = () => {
    try {
        db.execSync(`
           CREATE TABLE IF NOT EXISTS alcancias (
           local_id TEXT PRIMARY KEY,
           id INTEGER,

           codigo_alcancia INTEGER NOT NULL,
           nombre_persona TEXT NOT NULL,
           comunidad_id INTEGER,
           usuario_id INTEGER,

           colocada INTEGER DEFAULT 0,
           devuelta INTEGER DEFAULT 0,
           faltante INTEGER DEFAULT 0,
           
           monto_entregado REAL DEFAULT 0.00, -- NUMERIC(10,2) se mapea a REAL
           anio INTEGER NOT NULL,
        
           sync_status TEXT DEFAULT 'pending_insert'
           );
         ` );
         console.log('Base de datos local, inicializada con el esquema de Neon');
         
    } catch (error) {
        console.error('Error al inicializar db:', error);
        
    }
};

export default db;

export const guardarAlcanciaLocal = (datosFormulario) => { // <-- 1. Agregamos la 'l'
  try {
    // Generamos un UUID único
    const local_id = Crypto.randomUUID();

    // Extraer datos del formulario
    const {
      codigo_alcancia,
      nombre_persona,
      comunidad_id = null,
      usuario_id = null,
      colocada = 0,
      devuelta = 0,
      faltante = 0,
      monto_entregado = 0.00,
      anio = new Date().getFullYear() // <-- 2. Cambiamos Data() por Date()
    } = datosFormulario;

    // Insert en SQLite
    // 3. Cambiamos runAsync por runSync
    db.runSync(
      `INSERT INTO alcancias (
        local_id, codigo_alcancia, nombre_persona, comunidad_id, usuario_id,
        colocada, devuelta, faltante, monto_entregado, anio, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')`,
      [
        local_id, codigo_alcancia, nombre_persona, comunidad_id, usuario_id,
        colocada, devuelta, faltante, monto_entregado, anio
      ]
    );

    console.log('Alcancía guardada localmente con UUID:', local_id);
    return { exito: true, local_id };

  } catch (error) {
    console.error('Error al guardar en SQLite:', error);
    return { exito: false, error: error.message || "Error desconocido" };
  }
}
export const obtenerSiguienteCodigoLocal = (comunidad_id, rango_inicio) => {
  try {
    const resultado = db.getFirstSync(
      'SELECT MAX(codigo_alcancia) as max_codigo FROM alcancias WHERE comunidad_id = ?',
      [comunidad_id]
    );
    
    // Si hay un max_codigo, le sumamos 1. Si no hay nada, usamos el rango_inicio
    return resultado.max_codigo ? resultado.max_codigo + 1 : rango_inicio;
  } catch (error) {
    console.error('❌ Error al obtener siguiente código local:', error);
    return rango_inicio; 
  }
};
// Obtiene solo los registros que no se han subido al servidor
export const obtenerAlcanciasPendientes = () => {
  try {
    // Buscamos las que tienen tu estado 'pending_insert'
    return db.getAllSync("SELECT * FROM alcancias WHERE sync_status = 'pending_insert'");
  } catch (error) {
    console.error('❌ Error al obtener alcancías pendientes:', error);
    return [];
  }
};

// Obtiene las alcancías guardadas localmente de una comunidad, en el mismo orden que el servidor
export const obtenerAlcanciasLocales = (comunidad_id) => {
  try {
    return db.getAllSync(
      'SELECT * FROM alcancias WHERE comunidad_id = ? ORDER BY codigo_alcancia ASC',
      [comunidad_id]
    );
  } catch (error) {
    console.error('❌ Error al obtener alcancías locales:', error);
    return [];
  }
};

// Reemplaza la copia local de la comunidad con los datos del servidor.
// Las alcancías con sync_status 'pending_insert' no se tocan para no perder registros offline.
export const guardarAlcanciasServidor = (alcancias, comunidad_id) => {
  try {
    db.withTransactionSync(() => {
      db.runSync(
        "DELETE FROM alcancias WHERE comunidad_id = ? AND sync_status = 'synced'",
        [comunidad_id]
      );

      // Las que tienen cambios locales sin subir mandan sobre la versión del servidor
      const pendientes = db.getAllSync(
        "SELECT codigo_alcancia FROM alcancias WHERE comunidad_id = ? AND sync_status != 'synced'",
        [comunidad_id]
      );
      const codigosPendientes = new Set(pendientes.map((p) => p.codigo_alcancia));

      for (const a of alcancias) {
        if (codigosPendientes.has(a.codigo_alcancia)) continue;

        // Postgres devuelve booleanos y NUMERIC como texto; SQLite guarda 0/1 y REAL
        db.runSync(
          `INSERT OR REPLACE INTO alcancias (
            local_id, id, codigo_alcancia, nombre_persona, comunidad_id, usuario_id,
            colocada, devuelta, faltante, monto_entregado, anio, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
          [
            `srv-${a.id}`, a.id, a.codigo_alcancia, a.nombre_persona, a.comunidad_id, a.usuario_id,
            a.colocada ? 1 : 0, a.devuelta ? 1 : 0, a.faltante ? 1 : 0,
            a.monto_entregado != null ? parseFloat(a.monto_entregado) : null,
            a.anio
          ]
        );
      }
    });
    console.log('Copia local actualizada con', alcancias.length, 'alcancías del servidor');
  } catch (error) {
    console.error('❌ Error al guardar alcancías del servidor en SQLite:', error);
  }
};

// Actualiza el estado local para no volver a subirlas.
// Solo marca las que se enviaron, para no perder las que se registraron mientras se subían.
export const marcarComoSincronizadas = (local_ids) => {
  if (!local_ids || local_ids.length === 0) return;
  try {
    const marcadores = local_ids.map(() => '?').join(', ');
    db.runSync(
      `UPDATE alcancias SET sync_status = 'synced' WHERE sync_status = 'pending_insert' AND local_id IN (${marcadores})`,
      local_ids
    );
  } catch (error) {
    console.error('❌ Error al actualizar estado de sincronización:', error);
  }
};

// Guarda en el teléfono los cambios de una alcancía (estado y monto).
// Si la alcancía aún no se ha subido, sigue como 'pending_insert' y se sube ya con los cambios.
export const actualizarAlcanciaLocal = (codigo_alcancia, { colocada, devuelta, faltante, monto_entregado }) => {
  try {
    const resultado = db.runSync(
      `UPDATE alcancias
       SET colocada = ?, devuelta = ?, faltante = ?, monto_entregado = ?,
           sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
       WHERE codigo_alcancia = ?`,
      [colocada ? 1 : 0, devuelta ? 1 : 0, faltante ? 1 : 0, monto_entregado, codigo_alcancia]
    );

    if (resultado.changes === 0) {
      return { exito: false, error: 'La alcancía no está guardada en el teléfono' };
    }
    console.log('Cambios de la alcancía', codigo_alcancia, 'guardados localmente');
    return { exito: true };
  } catch (error) {
    console.error('❌ Error al actualizar alcancía en SQLite:', error);
    return { exito: false, error: error.message || 'Error desconocido' };
  }
};

// Obtiene las alcancías que ya existen en el servidor pero tienen cambios sin subir
export const obtenerActualizacionesPendientes = () => {
  try {
    return db.getAllSync("SELECT * FROM alcancias WHERE sync_status = 'pending_update'");
  } catch (error) {
    console.error('❌ Error al obtener actualizaciones pendientes:', error);
    return [];
  }
};

// Marca una actualización como subida, solo si no se volvió a editar mientras se enviaba
export const marcarActualizacionSincronizada = (local_id, monto_enviado, colocada, devuelta, faltante) => {
  try {
    db.runSync(
      `UPDATE alcancias SET sync_status = 'synced'
       WHERE local_id = ? AND sync_status = 'pending_update'
         AND monto_entregado IS ? AND colocada = ? AND devuelta = ? AND faltante = ?`,
      [local_id, monto_enviado, colocada, devuelta, faltante]
    );
  } catch (error) {
    console.error('❌ Error al marcar actualización como sincronizada:', error);
  }
};

// Indica si una alcancía todavía tiene cambios sin subir al servidor
export const tieneCambiosPendientes = (codigo_alcancia) => {
  try {
    const fila = db.getFirstSync(
      "SELECT sync_status FROM alcancias WHERE codigo_alcancia = ?",
      [codigo_alcancia]
    );
    return fila ? fila.sync_status !== 'synced' : false;
  } catch (error) {
    console.error('❌ Error al consultar estado de sincronización:', error);
    return true;
  }
};

// Cuenta cuántos cambios quedan por subir al servidor
export const contarPendientes = () => {
  try {
    const fila = db.getFirstSync("SELECT COUNT(*) as total FROM alcancias WHERE sync_status != 'synced'");
    return fila?.total ?? 0;
  } catch (error) {
    console.error('❌ Error al contar pendientes:', error);
    return 0;
  }
};