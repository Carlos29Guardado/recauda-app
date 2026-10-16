const express = require('express');
const router = express.Router();
const { verificarAdmin } = require('../middlewares/verificarRol')
const alcanciaController = require('../controllers/alcanciaController');
const { sincronizarAlcanciasOffline } = require('../controllers/alcanciaController');
const { verificarToken } = require('../middlewares/verificarToken');
const { verificarComunidad } = require('../middlewares/verificarComunidad');

// Todas las rutas de alcancías requieren sesión y pertenecer a una comunidad
router.use(verificarToken, verificarComunidad);

router.post('/', alcanciaController.crearAlcancia);
router.get('/comunidad/:comunidad_id', alcanciaController.obtenerAlcancias);
router.put('/:codigo',alcanciaController.actualizarAlcancia)
router.get('/siguiente/:comunidad_id', alcanciaController.obtenerSiguienteAlcancia);
router.post('/sincronizar', sincronizarAlcanciasOffline);


module.exports = router;
