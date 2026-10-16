const express = require('express');
const router = express.Router();
const { crearComunidad, unirseComunidad, obtenerUsuariosComunidad } = require('../controllers/comunidadController');
const { verificarToken } = require('../middlewares/verificarToken');

router.post('/crear', crearComunidad);
router.post('/unirse', unirseComunidad);
router.get('/usuarios', verificarToken, obtenerUsuariosComunidad);

module.exports = router;