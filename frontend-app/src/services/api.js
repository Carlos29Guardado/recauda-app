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
        }
    }

    return respuesta;
};
