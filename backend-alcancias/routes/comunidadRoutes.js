const express = require('express');
const router = express.Router();
const {
    crearComunidad,
    unirseComunidad,
    obtenerUsuariosComunidad,
    obtenerDetalleComunidad,
    cambiarNombreComunidad,
    regenerarCodigoInvitacion
} = require('../controllers/comunidadController');
const { verificarToken } = require('../middlewares/verificarToken');
const { verificarComunidad, soloAdmin } = require('../middlewares/verificarComunidad');

router.post('/crear', crearComunidad);
router.post('/unirse', unirseComunidad);
router.get('/usuarios', verificarToken, obtenerUsuariosComunidad);

// Administrar comunidad: solo el administrador actual de la comunidad
router.get('/detalle', verificarToken, verificarComunidad, soloAdmin, obtenerDetalleComunidad);
router.put('/nombre', verificarToken, verificarComunidad, soloAdmin, cambiarNombreComunidad);
router.post('/codigo', verificarToken, verificarComunidad, soloAdmin, regenerarCodigoInvitacion);

module.exports = router;
