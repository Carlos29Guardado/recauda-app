import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const db = SQLite.openDatabaseSync('recauda_offline.db');

export const createTables = () => {
    try {
        db.execSync(`
           CREATE TABLE IF NOT EXISTS alcancias (
           local_id TEXT PRIMARY KEY,
           id INTEGER,

           codigo_alcancia INTEGER NOT NULL UNIQUE,
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
         migrarCodigoUnico();
         console.log('Base de datos local, inicializada con el esquema de Neon');

    } catch (error) {
        console.error('Error al inicializar db:', error);

    }
};

// Migración 1: los teléfonos que ya tenían la tabla no reciben el UNIQUE del CREATE TABLE,
// así que limpiamos los duplicados existentes y creamos el índice único a mano.
const migrarCodigoUnico = () => {
    const { user_version } = db.getFirstSync('PRAGMA user_version');
    if (user_version >= 1) return;

    db.withTransactionSync(() => {
        const indiceUnico = db.getFirstSync(
            `SELECT COUNT(*) AS total
             FROM pragma_index_list('alcancias') AS il
             JOIN pragma_index_info(il.name) AS ii
             WHERE il."unique" = 1 AND ii.name = 'codigo_alcancia'`
        );

        if (indiceUnico.total === 0) {
            // Por cada código se queda una sola fila: primero las que tienen cambios sin subir
            // (para no perder trabajo offline) y, entre iguales, la más reciente
            db.runSync(
                `DELETE FROM alcancias WHERE rowid IN (
                   SELECT a.rowid FROM alcancias a
                   JOIN alcancias b
                     ON a.codigo_alcancia = b.codigo_alcancia AND a.rowid <> b.rowid
                   WHERE (CASE a.sync_status WHEN 'synced' THEN 0 ELSE 1 END) < (CASE b.sync_status WHEN 'synced' THEN 0 ELSE 1 END)
                      OR ((CASE a.sync_status WHEN 'synced' THEN 0 ELSE 1 END) = (CASE b.sync_status WHEN 'synced' THEN 0 ELSE 1 END)
                          AND a.rowid < b.rowid)
                 )`
            );
            db.execSync('CREATE UNIQUE INDEX IF NOT EXISTS idx_alcancias_codigo ON alcancias(codigo_alcancia)');
            console.log('Migración: duplicados eliminados e índice único creado en codigo_alcancia');
        }

        db.execSync('PRAGMA user_version = 1');
    });
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
    if (String(error.message).includes('UNIQUE')) {
      return { exito: false, error: `Ya existe una alcancía con el número ${datosFormulario.codigo_alcancia}.` };
    }
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
// - Si el código ya existe como 'pending_insert', el servidor ya lo tiene: se reemplaza con
//   los datos del servidor y queda como 'synced' (así no aparece duplicado).
// - Las de 'pending_update' no se tocan para no perder cambios offline que aún no se suben.
export const guardarAlcanciasServidor = (alcancias, comunidad_id) => {
  try {
    db.withTransactionSync(() => {
      db.runSync(
        "DELETE FROM alcancias WHERE comunidad_id = ? AND sync_status = 'synced'",
        [comunidad_id]
      );

      // Postgres puede mandar codigo_alcancia como texto; lo normalizamos a número para comparar
      const conCambiosSinSubir = db.getAllSync(
        "SELECT codigo_alcancia FROM alcancias WHERE sync_status = 'pending_update'"
      );
      const codigosConCambios = new Set(conCambiosSinSubir.map((p) => Number(p.codigo_alcancia)));

      for (const a of alcancias) {
        const codigo = Number(a.codigo_alcancia);
        if (codigosConCambios.has(codigo)) continue;

        // Postgres devuelve booleanos y NUMERIC como texto; SQLite guarda 0/1 y REAL
        db.runSync(
          `INSERT INTO alcancias (
            local_id, id, codigo_alcancia, nombre_persona, comunidad_id, usuario_id,
            colocada, devuelta, faltante, monto_entregado, anio, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
          ON CONFLICT(codigo_alcancia) DO UPDATE SET
            id = excluded.id,
            nombre_persona = excluded.nombre_persona,
            comunidad_id = excluded.comunidad_id,
            usuario_id = excluded.usuario_id,
            colocada = excluded.colocada,
            devuelta = excluded.devuelta,
            faltante = excluded.faltante,
            monto_entregado = excluded.monto_entregado,
            anio = excluded.anio,
            sync_status = 'synced'`,
          [
            `srv-${a.id}`, a.id, codigo, a.nombre_persona, Number(a.comunidad_id), a.usuario_id,
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
// Borra todas las alcancías guardadas en el teléfono (al cerrar sesión o al cambiar de cuenta).
// Así los pendientes de una cuenta nunca se suben con la sesión de otra persona.
export const borrarDatosLocales = () => {
  try {
    db.runSync('DELETE FROM alcancias');
    console.log('Datos locales borrados');
  } catch (error) {
    console.error('❌ Error al borrar datos locales:', error);
  }
};
