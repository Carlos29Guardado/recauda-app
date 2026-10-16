import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi } from '../services/api';

// Tiempo máximo de espera al servidor
const TIEMPO_ESPERA_MS = 8000;

export const useUsuariosComunidad = () => {
    const [administradores, setAdministradores] = useState([]);
    const [colaboradores, setColaboradores] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [error, setError] = useState(null);

    // Función para obtener los usuarios de la comunidad desde el backend
    const cargarUsuarios = async () => {
        try {
            setError(null);
            const token = await AsyncStorage.getItem('userToken');
            if (!token) {
                setError('No se encontró la sesión del usuario.');
                return;
            }

            const respuesta = await fetchApi('/comunidad/usuarios', {}, TIEMPO_ESPERA_MS);

            const datos = await respuesta.json();

            if (!respuesta.ok) {
                setError(datos.mensaje || datos.error || 'No se pudieron cargar los usuarios.');
                return;
            }

            // El servidor ya los manda ordenados: primero el administrador, luego los colaboradores
            setAdministradores(datos.filter((u) => u.rol === 'admin'));
            setColaboradores(datos.filter((u) => u.rol !== 'admin'));
        } catch (err) {
            console.log('No se pudieron cargar los usuarios:', err?.message || err);
            setError('Necesitas conexión a internet para ver los usuarios de la comunidad.');
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    };

    // Se ejecuta automáticamente al abrir la pantalla
    useFocusEffect(
        useCallback(() => {
            cargarUsuarios();
        }, [])
    );

    // Función para jalar hacia abajo y recargar
    const onRefresh = () => {
        setRefrescando(true);
        cargarUsuarios();
    };

    return {
        administradores,
        colaboradores,
        cargando,
        refrescando,
        error,
        onRefresh
    };
};
