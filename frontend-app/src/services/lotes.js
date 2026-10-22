import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi } from './api';
import { obtenerCodigosLocales } from '../../database/sqlite';

// Lotes: rangos de números exclusivos que el administrador le asigna a cada colaborador.
// Se guardan en la sesión (userData) para poder asignar números sin internet:
//   usa_lotes: la comunidad trabaja con lotes (sin lote no se puede registrar)
//   lotes: [{ rango_inicio, rango_fin }] del usuario
//   lotes_usados_servidor: números de sus lotes que ya estaban registrados en el servidor

// Pide al servidor los lotes del usuario y los guarda en la sesión.
// Devuelve la sesión actualizada, o null si no hay internet (se siguen usando los guardados).
export const refrescarMisLotes = async () => {
    try {
        const respuesta = await fetchApi('/comunidad/mis-lotes', {}, 6000);
        if (!respuesta.ok) return null;
        const datos = await respuesta.json();

        const usuario = JSON.parse((await AsyncStorage.getItem('userData')) || '{}');
        const actualizado = {
            ...usuario,
            usa_lotes: Boolean(datos.usa_lotes),
            lotes: (datos.lotes || []).map((l) => ({ rango_inicio: Number(l.rango_inicio), rango_fin: Number(l.rango_fin) })),
            lotes_usados_servidor: datos.usados || []
        };
        await AsyncStorage.setItem('userData', JSON.stringify(actualizado));
        return actualizado;
    } catch (error) {
        return null;
    }
};

// Número libre más bajo dentro de los lotes, sin repetir ninguno de `usados`. null si ya no quedan.
export const siguienteNumeroLibre = (lotes, usados) => {
    const ordenados = [...(lotes || [])].sort((a, b) => a.rango_inicio - b.rango_inicio);
    for (const lote of ordenados) {
        for (let numero = lote.rango_inicio; numero <= lote.rango_fin; numero++) {
            if (!usados.has(numero)) return numero;
        }
    }
    return null;
};

// Siguiente número para el usuario según sus lotes, con lo que hay en el teléfono y en el servidor.
// Funciona sin internet: los números del lote son solo suyos, así que nadie más los puede usar.
export const siguienteNumeroDelUsuario = (usuario) => {
    const usados = new Set([
        ...obtenerCodigosLocales(usuario.comunidad_id),
        ...(usuario.lotes_usados_servidor || []).map(Number)
    ]);
    return siguienteNumeroLibre(usuario.lotes, usados);
};

// ¿El número pertenece a alguno de los lotes?
export const numeroEnLotes = (numero, lotes) =>
    (lotes || []).some((l) => numero >= l.rango_inicio && numero <= l.rango_fin);

// Texto corto para mostrar los lotes, por ejemplo "5073–5091, 5120–5124"
export const describirLotes = (lotes) =>
    (lotes || [])
        .map((l) => (l.rango_inicio === l.rango_fin ? `${l.rango_inicio}` : `${l.rango_inicio}–${l.rango_fin}`))
        .join(', ');
