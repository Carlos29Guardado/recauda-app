import { useEffect } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
    obtenerAlcanciasPendientes,
    marcarComoSincronizadas,
    obtenerActualizacionesPendientes,
    marcarActualizacionSincronizada,
    contarPendientes
} from '../../database/sqlite';
import { fetchApi } from '../services/api';

//Candado virtual compartido: evita que la pantalla y el listener de red suban lo mismo dos veces
let sincronizando = false;

// Sube al servidor las alcancías nuevas y los cambios guardados offline.
// Devuelve cuántas se subieron y cuántas quedan pendientes.
export const sincronizarPendientes = async () => {
    const resultado = { insertadas: 0, actualizadas: 0, pendientes: contarPendientes() };

    //Si el candado está cerrado o no hay nada que subir, no hacemos nada
    if (sincronizando || resultado.pendientes === 0) return resultado;

    const estadoRed = await NetInfo.fetch();
    if (estadoRed.isConnected === false || estadoRed.isInternetReachable === false) return resultado;

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
            if (respuesta.ok) {
                marcarComoSincronizadas(nuevas.map((a) => a.local_id));
                resultado.insertadas = nuevas.length;
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

export const useSincronizacionAutomatica = () => {
    useEffect(() => {
        const unsubcribe = NetInfo.addEventListener(async (state) => {
            //Si hay internet y si la señal es real
            if (!state.isConnected || !state.isInternetReachable) return;

            const { insertadas, actualizadas } = await sincronizarPendientes();
            const total = insertadas + actualizadas;

            if (total > 0) {
                Alert.alert(
                    'Sincronización automática',
                    `Se detectó conexión y se subieron ${total} cambios que tenías guardados offline.`
                );
            }
        });
        return () => unsubcribe();
    }, []);
};
