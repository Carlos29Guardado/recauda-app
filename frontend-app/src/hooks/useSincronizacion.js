import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    obtenerAlcanciasPendientes,
    marcarComoSincronizadas,
    obtenerActualizacionesPendientes,
    marcarActualizacionSincronizada,
    marcarConflictos,
    contarPendientes
} from '../../database/sqlite';
import { fetchApi, comunidadEstaActiva } from '../services/api';

//Candado virtual compartido: evita que la pantalla y el listener de red suban lo mismo dos veces
let sincronizando = false;

// Sube al servidor las alcancías nuevas y los cambios guardados offline.
// Devuelve cuántas se subieron y cuántas quedan pendientes.
export const sincronizarPendientes = async () => {
    const resultado = { insertadas: 0, actualizadas: 0, conflictos: [], pendientes: contarPendientes() };

    //Si el candado está cerrado o no hay nada que subir, no hacemos nada
    if (sincronizando || resultado.pendientes === 0) return resultado;

    const estadoRed = await NetInfo.fetch();
    if (estadoRed.isConnected === false || estadoRed.isInternetReachable === false) return resultado;

    // Con la comunidad cerrada el servidor no acepta cambios: se quedan guardados por si se reabre
    const usuario = JSON.parse((await AsyncStorage.getItem('userData')) || '{}');
    if (!comunidadEstaActiva(usuario)) return resultado;

    //Cerramos el candado antes de enviar al servidor
    sincronizando = true;
    try {
        // 1. Alcancías registradas sin conexión
        const nuevas = obtenerAlcanciasPendientes();
        if (nuevas.length > 0) {
            console.log(`Sincronizando ${nuevas.length} alcancías nuevas...`);
            const respuesta = await fetchApi('/alcancias/sincronizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alcancias: nuevas })
            });
            // 403: sesión vencida o comunidad cerrada (fetchApi ya avisó); no tiene caso seguir
            if (respuesta.status === 403) return resultado;
            if (respuesta.ok) {
                const datos = await respuesta.json().catch(() => ({}));

                // Las que el servidor no aceptó (número repetido o fuera de rango) quedan en 'conflict'
                // para que el colaborador corrija el número; las demás se marcan como subidas
                const conflictos = Array.isArray(datos.conflictos) ? datos.conflictos : [];
                const idsConflicto = new Set(conflictos.map((c) => c.local_id));
                marcarConflictos([...idsConflicto]);
                marcarComoSincronizadas(nuevas.map((a) => a.local_id).filter((id) => !idsConflicto.has(id)));

                resultado.insertadas = nuevas.length - idsConflicto.size;
                resultado.conflictos = conflictos;

                if (conflictos.length > 0) {
                    Alert.alert(
                        'Números de alcancía por revisar',
                        conflictos.map((c) => `• ${c.mensaje}`).join('\n') +
                        '\n\nEn la Lista de Alcancías aparece marcada como "Número repetido": ábrela y toca "Asignar nuevo número".'
                    );
                }
            }
        }

        // 2. Cambios de estado y monto hechos sin conexión
        const cambios = obtenerActualizacionesPendientes();
        for (const a of cambios) {
            const respuesta = await fetchApi(`/alcancias/${a.codigo_alcancia}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    colocada: a.colocada === 1,
                    devuelta: a.devuelta === 1,
                    faltante: a.faltante === 1,
                    monto_entregado: a.monto_entregado
                })
            });
            if (respuesta.status === 403) return resultado;
            if (respuesta.ok) {
                marcarActualizacionSincronizada(a.local_id, a.monto_entregado, a.colocada, a.devuelta, a.faltante);
                resultado.actualizadas++;
            } else {
                console.log(`El servidor rechazó el cambio de la alcancía #${a.codigo_alcancia}:`, respuesta.status);
            }
        }
    } catch (error) {
        console.log('Intento de sincronización fallido, se intentará de nuevo luego.', error?.message || error);
    } finally {
        //Abrimos el candado pase lo que pase
        sincronizando = false;
        resultado.pendientes = contarPendientes();
    }
    return resultado;
};

// Cada cuánto se reintenta subir lo pendiente mientras la app está abierta
const INTERVALO_REINTENTO_MS = 60000;

export const useSincronizacionAutomatica = () => {
    useEffect(() => {
        // Sube lo pendiente y avisa solo si de verdad se subió algo
        const intentarSubir = async () => {
            const { insertadas, actualizadas } = await sincronizarPendientes();
            const total = insertadas + actualizadas;

            if (total > 0) {
                Alert.alert(
                    'Sincronización automática',
                    `Se subieron ${total} cambios que tenías guardados en el teléfono.`
                );
            }
        };

        // 1. Cuando vuelve la conexión
        const unsubcribe = NetInfo.addEventListener((state) => {
            //Si hay internet y si la señal es real
            if (!state.isConnected || !state.isInternetReachable) return;
            intentarSubir();
        });

        // 2. Cuando el usuario regresa a la app (estaba en segundo plano)
        const suscripcionApp = AppState.addEventListener('change', (estado) => {
            if (estado === 'active') intentarSubir();
        });

        // 3. Cada minuto mientras la app está abierta: si no hay nada pendiente no usa internet
        const intervalo = setInterval(intentarSubir, INTERVALO_REINTENTO_MS);

        return () => {
            unsubcribe();
            suscripcionApp.remove();
            clearInterval(intervalo);
        };
    }, []);
};
