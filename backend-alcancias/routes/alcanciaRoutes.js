const express = require('express');
const router = express.Router();
const { verificarAdmin } = require('../middlewares/verificarRol')
const alcanciaController = require('../controllers/alcanciaController');
const { sincronizarAlcanciasOffline } = require('../controllers/alcanciaController');
const { verificarToken } = require('../middlewares/verificarToken');
const { verificarComunidad, soloComunidadActiva } = require('../middlewares/verificarComunidad');

// Todas las rutas de alcancías requieren sesión y pertenecer a una comunidad
router.use(verificarToken, verificarComunidad);

// Consultar se permite siempre; registrar o modificar solo si la comunidad sigue activa
router.post('/', soloComunidadActiva, alcanciaController.crearAlcancia);
router.get('/comunidad/:comunidad_id', alcanciaController.obtenerAlcancias);
router.put('/:codigo', soloComunidadActiva, alcanciaController.actualizarAlcancia)
router.get('/siguiente/:comunidad_id', alcanciaController.obtenerSiguienteAlcancia);
router.post('/sincronizar', soloComunidadActiva, sincronizarAlcanciasOffline);


module.exports = router;
