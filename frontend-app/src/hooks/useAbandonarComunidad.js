import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi, quitarComunidadDeSesion, comunidadEstaActiva } from '../services/api';
import { contarPendientes, borrarDatosLocales } from '../../database/sqlite';
import { sincronizarPendientes } from './useSincronizacion';

const MENSAJE_SIN_CONEXION = 'Necesitas conexión a internet para abandonar la comunidad.';

export const useAbandonarComunidad = () => {
    const [usuario, setUsuario] = useState(/** @type {any} */ (null));
    // Para el admin: los demás miembros, entre los que elige al nuevo administrador
    const [otrosMiembros, setOtrosMiembros] = useState(/** @type {any[]} */ ([]));
    const [nuevoAdmin, setNuevoAdmin] = useState(/** @type {number | null} */ (null));
    const [pendientes, setPendientes] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [procesando, setProcesando] = useState(false);

    const esAdmin = usuario?.rol === 'admin';
    const comunidadActiva = comunidadEstaActiva(usuario);

    const preparar = async () => {
        setCargando(true);
        setError(null);
        try {
            const sesion = JSON.parse((await AsyncStorage.getItem('userData')) || '{}');
            setUsuario(sesion);

            // Antes de salir se intenta subir lo pendiente, para no perder alcancías
            await sincronizarPendientes();
            setPendientes(contarPendientes());

            if (sesion.rol === 'admin') {
                const respuesta = await fetchApi('/comunidad/usuarios', {}, 8000);
                const datos = await respuesta.json();
                if (!respuesta.ok) {
                    setError(datos.mensaje || datos.error || 'No se pudo cargar la lista de miembros.');
                    return;
                }
                setOtrosMiembros(datos.filter((m) => Number(m.id) !== Number(sesion.id)));
            }
        } catch (err) {
            setError(MENSAJE_SIN_CONEXION);
        } finally {
            setCargando(false);
        }
    };

    // Se ejecuta automáticamente al abrir la pantalla
    useFocusEffect(
        useCallback(() => {
            preparar();
        }, [])
    );

    const ejecutarSalida = async () => {
        setProcesando(true);
        try {
            const respuesta = await fetchApi('/comunidad/abandonar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevo_admin_id: nuevoAdmin })
            });
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                Alert.alert('No se pudo salir', datos.mensaje || 'Intenta de nuevo.');
                return;
            }

            // Se borra todo lo de esa comunidad del teléfono y se vuelve a la bienvenida
            borrarDatosLocales();
            await quitarComunidadDeSesion();

            Alert.alert('Saliste de la comunidad', datos.mensaje, [
                { text: 'OK', onPress: () => router.replace('/bienvenida') }
            ], { cancelable: false });
        } catch (err) {
            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
        } finally {
            setProcesando(false);
        }
    };

    const abandonar = () => {
        // Con la comunidad activa no se sale si quedan cambios sin subir (se perderían)
        if (pendientes > 0 && comunidadActiva) {
            Alert.alert(
                'Cambios sin subir',
                `Tienes ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin subir al servidor. Conéctate a internet y toca "Reintentar" para subirlos antes de salir.`
            );
            return;
        }
        if (esAdmin && otrosMiembros.length > 0 && nuevoAdmin == null) {
            Alert.alert('Elige al nuevo administrador', 'Toca el nombre de la persona que se quedará a cargo de la comunidad.');
            return;
        }

        const elegido = otrosMiembros.find((m) => Number(m.id) === Number(nuevoAdmin));
        const detalle = esAdmin
            ? (otrosMiembros.length > 0
                ? `${elegido?.nombre || 'La persona elegida'} quedará como administrador.`
                : 'Eres el único miembro: la comunidad quedará cerrada y archivada.')
            : 'Las alcancías que registraste se quedan en la comunidad.';
        const avisoPendientes = pendientes > 0
            ? `\n\nTienes ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin subir que no se pueden subir porque la comunidad está cerrada; se borrarán del teléfono.`
            : '';

        Alert.alert(
            'Abandonar comunidad',
            `${detalle}\n\nPara volver tendrás que unirte otra vez con un código de invitación.${avisoPendientes}`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abandonar', style: 'destructive', onPress: ejecutarSalida }
            ]
        );
    };

    return {
        usuario,
        esAdmin,
        otrosMiembros,
        nuevoAdmin, setNuevoAdmin,
        pendientes,
        comunidadActiva,
        cargando,
        error,
        procesando,
        abandonar,
        reintentar: preparar
    };
};
