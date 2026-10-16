import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config/config';

// Tiempo máximo de espera por defecto para cada petición
const TIEMPO_ESPERA_MS = 10000;

// fetch hacia la API con el token de sesión y un tiempo máximo de espera.
// `ruta` es relativa a API_URL, por ejemplo '/alcancias/sincronizar'.
export const fetchApi = async (ruta, opciones = {}, tiempoMs = TIEMPO_ESPERA_MS) => {
    const token = await AsyncStorage.getItem('userToken');

    // Cortamos la petición si el servidor tarda demasiado (red lenta o sin salida a internet)
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), tiempoMs);

    return fetch(`${API_URL}${ruta}`, {
        ...opciones,
        headers: {
            ...(opciones.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: controlador.signal
    }).finally(() => clearTimeout(temporizador));
};
