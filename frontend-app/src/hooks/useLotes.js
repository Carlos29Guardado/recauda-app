import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchApi } from '../services/api';

const MENSAJE_SIN_CONEXION = 'Necesitas conexión a internet para administrar los lotes.';

// Primer número que todavía no está en ningún lote (para sugerirlo al asignar uno nuevo)
const sugerirInicio = (datos) => {
    const finales = datos.miembros.flatMap((m) => m.lotes.map((l) => l.rango_fin));
    if (finales.length === 0) return datos.rango_inicio ?? '';
    const siguiente = Math.max(...finales) + 1;
    if (datos.rango_fin != null && siguiente > datos.rango_fin) return '';
    return siguiente;
};

export const useLotes = () => {
    const [datos, setDatos] = useState(/** @type {any} */ (null));
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    // Formulario para asignar un lote nuevo
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(/** @type {number | null} */ (null));
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargarLotes = async () => {
        try {
            setError(null);
            const respuesta = await fetchApi('/comunidad/lotes', {}, 8000);
            const json = await respuesta.json();

            if (!respuesta.ok) {
                setError(json.mensaje || json.error || 'No se pudieron cargar los lotes.');
                return;
            }

            setDatos(json);
            const inicio = sugerirInicio(json);
            setDesde(inicio === '' ? '' : String(inicio));
            setHasta('');
        } catch (err) {
            console.log('No se pudieron cargar los lotes:', err?.message || err);
            setError(MENSAJE_SIN_CONEXION);
        } finally {
            setCargando(false);
        }
    };

    // Se ejecuta automáticamente al abrir la pantalla
    useFocusEffect(
        useCallback(() => {
            cargarLotes();
        }, [])
    );

    const asignarLote = async () => {
        const inicio = Number(desde);
        const fin = Number(hasta);

        if (usuarioSeleccionado == null) {
            Alert.alert('Elige un colaborador', 'Toca el nombre de la persona a quien le vas a entregar el lote.');
            return;
        }
        if (!desde || !hasta || !Number.isInteger(inicio) || !Number.isInteger(fin)) {
            Alert.alert('Faltan números', 'Escribe el primer y el último número del lote.');
            return;
        }
        if (inicio > fin) {
            Alert.alert('Rango inválido', 'El primer número no puede ser mayor que el último.');
            return;
        }

        setGuardando(true);
        try {
            const respuesta = await fetchApi('/comunidad/lotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: usuarioSeleccionado, rango_inicio: inicio, rango_fin: fin })
            });
            const json = await respuesta.json();

            if (!respuesta.ok) {
                Alert.alert('No se pudo asignar', json.mensaje || 'Revisa los números del lote.');
                return;
            }

            Alert.alert('Lote asignado', `${json.mensaje}: ${inicio} a ${fin} (${fin - inicio + 1} alcancías).`);
            setUsuarioSeleccionado(null);
            await cargarLotes();
        } catch (err) {
            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
        } finally {
            setGuardando(false);
        }
    };

    const eliminarLote = (lote, nombre) => {
        Alert.alert(
            'Quitar lote',
            `¿Quitar el lote ${lote.rango_inicio} a ${lote.rango_fin} de ${nombre}? Solo se puede si todavía no tiene alcancías registradas.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Quitar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const respuesta = await fetchApi(`/comunidad/lotes/${lote.id}`, { method: 'DELETE' });
                            const json = await respuesta.json();
                            if (!respuesta.ok) {
                                Alert.alert('No se pudo quitar', json.mensaje || 'Intenta de nuevo.');
                                return;
                            }
                            await cargarLotes();
                        } catch (err) {
                            Alert.alert('Sin conexión', MENSAJE_SIN_CONEXION);
                        }
                    }
                }
            ]
        );
    };

    return {
        datos,
        cargando,
        error,
        usuarioSeleccionado, setUsuarioSeleccionado,
        desde, setDesde,
        hasta, setHasta,
        guardando,
        asignarLote,
        eliminarLote,
        reintentar: cargarLotes
    };
};
