import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { API_URL } from '../../config/config';

// Tiempo máximo de espera por defecto para cada petición
const TIEMPO_ESPERA_MS = 10000;

// Evita mostrar el aviso de sesión vencida varias veces seguidas
let avisoSesionMostrado = false;

// El token venció: se quita solo el token (los datos del usuario y los cambios
// pendientes en SQLite se conservan) y se pide volver a iniciar sesión para subirlos.
const avisarSesionVencida = async () => {
    if (avisoSesionMostrado) return;
    avisoSesionMostrado = true;

    await AsyncStorage.removeItem('userToken');

    Alert.alert(
        'Sesión vencida',
        'Tu sesión expiró. Tus cambios siguen guardados en el teléfono; inicia sesión de nuevo para subirlos al servidor.',
        [{
            text: 'Iniciar sesión',
            onPress: () => {
                avisoSesionMostrado = false;
                router.replace('/');
            }
        }],
        { cancelable: false }
    );
};

// Guarda en la sesión si la comunidad está activa o cerrada (campaña finalizada).
// Con este dato la app funciona en modo "solo consulta" aunque no haya internet.
export const guardarEstadoComunidad = async (activa) => {
    const usuarioString = await AsyncStorage.getItem('userData');
    if (!usuarioString) return;
    await AsyncStorage.setItem('userData', JSON.stringify({ ...JSON.parse(usuarioString), comunidad_activa: activa }));
};

// Quita de la sesión todo lo de la comunidad (al abandonarla). Se conservan los datos de la cuenta.
export const quitarComunidadDeSesion = async () => {
    const usuarioString = await AsyncStorage.getItem('userData');
    if (!usuarioString) return;
    const {
        comunidad_id, comunidad_nombre, comunidad_codigo, rango_inicio, rango_fin,
        comunidad_activa, usa_lotes, lotes, lotes_usados_servidor,
        ...cuenta
    } = JSON.parse(usuarioString);
    await AsyncStorage.setItem('userData', JSON.stringify({ ...cuenta, rol: 'colaborador', comunidad_id: null }));
};

// La comunidad está activa salvo que se haya marcado explícitamente como cerrada
export const comunidadEstaActiva = (usuario) => usuario?.comunidad_activa !== false;

// Evita repetir el aviso de comunidad cerrada en cada petición
let avisoCierreMostrado = false;

const avisarComunidadCerrada = async () => {
    await guardarEstadoComunidad(false);
    if (avisoCierreMostrado) return;
    avisoCierreMostrado = true;
    Alert.alert(
        'Comunidad cerrada',
        'El administrador cerró la comunidad porque la campaña terminó. Puedes consultar las alcancías, pero ya no registrar ni editar. Si tenías cambios sin subir, se quedan guardados en el teléfono por si la comunidad se reabre.'
    );
};

// Pregunta al servidor si la comunidad sigue activa y lo guarda en la sesión.
// Devuelve true/false, o null si no se pudo consultar (sin internet).
export const refrescarEstadoComunidad = async () => {
    try {
        const respuesta = await fetchApi('/comunidad/estado', {}, 6000);
        if (!respuesta.ok) return null;
        const { activa } = await respuesta.json();
        await guardarEstadoComunidad(activa);
        if (activa) avisoCierreMostrado = false;
        return activa;
    } catch (error) {
        return null;
    }
};

// fetch hacia la API con el token de sesión y un tiempo máximo de espera.
// `ruta` es relativa a API_URL, por ejemplo '/alcancias/sincronizar'.
export const fetchApi = async (ruta, opciones = {}, tiempoMs = TIEMPO_ESPERA_MS) => {
    const token = await AsyncStorage.getItem('userToken');

    // Cortamos la petición si el servidor tarda demasiado (red lenta o sin salida a internet)
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), tiempoMs);

    const respuesta = await fetch(`${API_URL}${ruta}`, {
        ...opciones,
        headers: {
            ...(opciones.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: controlador.signal
    }).finally(() => clearTimeout(temporizador));

    // verificarToken responde 403 "Token inválido o expirado." cuando el token ya no sirve
    if (token && respuesta.status === 403) {
        const cuerpo = await respuesta.clone().json().catch(() => ({}));
        if (String(cuerpo.error || '').includes('Token')) {
            avisarSesionVencida();
        } else if (cuerpo.comunidad_cerrada) {
            avisarComunidadCerrada();
        }
    }

    return respuesta;
};
