const pool = require('./db');

// Cambios de esquema que se aplican solos al arrancar el servidor.
// Usan IF NOT EXISTS, así que se pueden ejecutar en cada arranque sin problema.
const ejecutarMigraciones = async () => {
    // Comunidad cerrada (campaña finalizada): sus datos quedan solo para consulta
    await pool.query('ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true');
    await pool.query('ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ');
    console.log('Migraciones aplicadas');
};

module.exports = { ejecutarMigraciones };
