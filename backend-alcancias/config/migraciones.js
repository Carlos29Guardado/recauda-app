const pool = require('./db');

// Cambios de esquema que se aplican solos al arrancar el servidor.
// Usan IF NOT EXISTS, así que se pueden ejecutar en cada arranque sin problema.
const ejecutarMigraciones = async () => {
    // Comunidad cerrada (campaña finalizada): sus datos quedan solo para consulta
    await pool.query('ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true');
    await pool.query('ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ');

    // Lotes: rango de números que el administrador le asigna a cada colaborador.
    // Un colaborador puede tener varios lotes (uno por cada entrega de alcancías).
    // Las reglas (dentro del rango de la comunidad, sin encimarse) se validan en loteController.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lotes (
            id SERIAL PRIMARY KEY,
            comunidad_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            rango_inicio INTEGER NOT NULL,
            rango_fin INTEGER NOT NULL,
            creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (rango_inicio <= rango_fin)
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lotes_comunidad ON lotes (comunidad_id)');

    console.log('Migraciones aplicadas');
};

module.exports = { ejecutarMigraciones };
