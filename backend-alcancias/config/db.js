const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.POSTGRE_SQL;

const pool = new Pool({
    connectionString,
});

pool.connect( (err, client, release) =>{
    if(err){
        return console.error('Error adquiriendo el cliente de la base de datos', err.stack);
    }
    console.log('Conectado exitosamente a PostgreSQL en Neon');
    release(); 
})
module.exports = {
  query: (text, params) => pool.query(text, params),
  // Cliente dedicado para transacciones: BEGIN/COMMIT deben ir en la misma conexión
  connect: () => pool.connect(),
};