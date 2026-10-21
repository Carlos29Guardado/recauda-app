import { useState, useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi } from '../services/api';

const MENSAJE_SIN_CONEXION = 'Necesitas conexión a internet para administrar la comunidad.';

// Actualiza los datos de la comunidad guardados en la sesión (para el menú y el perfil)
const actualizarSesion = async (cambios) => {
    const usuarioString = await AsyncStorage.getItem('userData');
    if (!usuarioString) return;
    await AsyncStorage.setItem('userData', JSON.stringify({ ...JSON.parse(usuarioString), ...cambios }));
};

export const useAdministrarComunidad = () => {
    const [comunidad, setComunidad] = useState(/** @type {any} */ (null));
    const [nombre, setNombre] = useState('');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [guardandoNombre, setGuardandoNombre] = useState(false);
    const [regenerando, setRegenerando] = useState(false);
    const [cambiandoEstado, setCambiandoEstado] = useState(false);

    // Función para obtener los datos de la comunidad desde el backend
    const cargarComunidad = async () => {
        try {
            setError(null);
            const respuesta = await fetchApi('/comunidad/detalle', {}, 8000);
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                setError(datos.mensaje || datos.error || 'No se pudo cargar la comunidad.');
                return;
            }

            setComunidad(datos);
            setNombre(datos.nombre);
            await actualizarSesion({
                comunidad_nombre: datos.nombre,
                comunidad_codigo: datos.codigo_invitacion,
                comunidad_activa: datos.activa
            });
        } catch (err) {
            console.log('No se pudo cargar la comunidad:', err?.message || err);
            setError(MENSAJE_SIN_CONEXION);
        } finally {
            setCargando(false);
        }
    };

    // Se ejecuta automáticamente al abrir la pantalla
    useFocusEffect(
        useCallback(() => {
            cargarComunidad();
        }, [])
    );

    const guardarNombre = async () => {
        const nuevoNombre = nombre.trim();
        if (nuevoNombre.length < 3) {
            Alert.alert('Nombre muy corto', 'El nombre debe tener al menos 3 caracteres.');
            return;
        }
        if (nuevoNombre === comunidad?.nombre) return;

        setGuardandoNombre(true);
        try {
            const respuesta = await fetchApi('/comunidad/nombre', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nuevoNombre })
            });
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                Alert.alert('Error', datos.mensaje || 'No se pudo cambiar el nombre.');
                return;
            }

            setComunidad((c) => ({ ...c, nombre: datos.nombre }));
            setNombre(datos.nombre);
            await actualizarSesion({ comunidad_nombre: datos.nombre });
            Alert.alert('Listo', 'El nombre de la comunidad se actualizó.');
        } catch (err) {
            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
        } finally {
            setGuardandoNombre(false);
        }
    };

    // Abre el menú del teléfono para mandar el código por WhatsApp, mensaje, etc.
    const compartirCodigo = async () => {
        if (!comunidad?.codigo_invitacion) return;
        try {
            await Share.share({
                message: `Únete a la comunidad "${comunidad.nombre}" en Recauda con este código de invitación: ${comunidad.codigo_invitacion}`
            });
        } catch (err) {
            console.log('No se pudo compartir el código:', err?.message || err);
        }
    };

    // Genera un código nuevo; el anterior deja de servir para unirse
    const regenerarCodigo = () => {
        Alert.alert(
            'Generar código nuevo',
            'El código actual dejará de funcionar. Quienes ya están en la comunidad no se ven afectados. ¿Continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Generar',
                    onPress: async () => {
                        setRegenerando(true);
                        try {
                            const respuesta = await fetchApi('/comunidad/codigo', { method: 'POST' });
                            const datos = await respuesta.json();

                            if (!respuesta.ok) {
                                Alert.alert('Error', datos.mensaje || 'No se pudo generar el código.');
                                return;
                            }

                            setComunidad((c) => ({ ...c, codigo_invitacion: datos.codigo_invitacion }));
                            await actualizarSesion({ comunidad_codigo: datos.codigo_invitacion });
                        } catch (err) {
                            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
                        } finally {
                            setRegenerando(false);
                        }
                    }
                }
            ]
        );
    };

    // Cierra la comunidad cuando termina la campaña (solo consulta) o la reabre
    const cambiarEstado = (activa) => {
        Alert.alert(
            activa ? 'Reabrir comunidad' : 'Cerrar comunidad',
            activa
                ? 'Los colaboradores podrán volver a registrar y editar alcancías, y el código de invitación vuelve a funcionar. ¿Continuar?'
                : 'Úsalo cuando la campaña haya terminado (alcancías entregadas, recogidas y contadas).\n\n' +
                  '• Nadie podrá registrar ni editar alcancías.\n' +
                  '• El código de invitación dejará de funcionar.\n' +
                  '• Todos los datos se conservan y se pueden consultar.\n\n' +
                  'Antes de cerrar, asegúrate de que todos los colaboradores hayan subido sus cambios. Podrás reabrirla después.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: activa ? 'Reabrir' : 'Cerrar comunidad',
                    style: activa ? 'default' : 'destructive',
                    onPress: async () => {
                        setCambiandoEstado(true);
                        try {
                            const respuesta = await fetchApi('/comunidad/estado', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ activa })
                            });
                            const datos = await respuesta.json();

                            if (!respuesta.ok) {
                                Alert.alert('Error', datos.mensaje || 'No se pudo cambiar el estado de la comunidad.');
                                return;
                            }

                            setComunidad((c) => ({ ...c, activa: datos.activa, fecha_cierre: datos.fecha_cierre }));
                            await actualizarSesion({ comunidad_activa: datos.activa });
                        } catch (err) {
                            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
                        } finally {
                            setCambiandoEstado(false);
                        }
                    }
                }
            ]
        );
    };

    return {
        comunidad,
        nombre, setNombre,
        cargando,
        error,
        guardandoNombre,
        regenerando,
        cambiandoEstado,
        cambiarEstado,
        guardarNombre,
        compartirCodigo,
        regenerarCodigo,
        reintentar: cargarComunidad
    };
};
