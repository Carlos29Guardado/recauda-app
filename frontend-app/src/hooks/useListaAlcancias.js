import { useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { fetchApi, comunidadEstaActiva } from '../services/api';
import { obtenerAlcanciasLocales, guardarAlcanciasServidor } from '../../database/sqlite';
import { sincronizarPendientes } from './useSincronizacion';

// Tiempo máximo de espera al servidor antes de usar los datos locales
const TIEMPO_ESPERA_MS = 8000;

// Opciones de los botones de filtro por estado
const OPCIONES_FILTRO = ['Todas', 'Colocada', 'Devuelta', 'Faltante'];

// Quita acentos y pasa a minúsculas para que "jose" encuentre "José"
const ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
const normalizar = (texto) =>
    String(texto ?? '').toLowerCase().replace(/[áéíóúüñ]/g, (letra) => ACENTOS[letra]);

// Estado de la alcancía según los booleanos de la BD (0/1 en SQLite)
const obtenerEstado = (item) => {
    if (item.faltante) return 'Faltante';
    if (item.devuelta) return 'Devuelta';
    return 'Colocada';
};

export const useListaAlcancias = () => {
    //Para Buscador
    //Estado original: guarda la lista completa e intacta de la base de datos.
    const [alcanciasOriginales, setAlcanciasOriginales] = useState([]);

    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('Todas');
    const [cargando, setCargando] = useState(true);
    const [comunidadActiva, setComunidadActiva] = useState(true);
    const [refrescando, setRefrescando] = useState(false);

    //Funcion para cargar los datos de la base de datos local
    const cargarAlcanciasLocales = (comunidad_id) => {
        const locales = obtenerAlcanciasLocales(comunidad_id);
        console.log("Cargando desde SQLite:", locales.length, "registros");
        setAlcanciasOriginales(locales);
    };

    // Función para obtener los datos del backend; si no hay red o falla, usa SQLite sin alertas
    const cargarAlcancias = async () => {
        let usuario = null;
        try {
            const usuarioString = await AsyncStorage.getItem('userData');
            if (!usuarioString) {
                Alert.alert('Error', 'No se encontró la sesión del usuario');
                return;
            }
            usuario = JSON.parse(usuarioString);
            setComunidadActiva(comunidadEstaActiva(usuario));

            // Si el teléfono no tiene red, ni siquiera intentamos el fetch
            const estadoRed = await NetInfo.fetch();
            if (estadoRed.isConnected === false || estadoRed.isInternetReachable === false) {
                console.log('Sin conexión, cargando alcancías desde SQLite');
                cargarAlcanciasLocales(usuario.comunidad_id);
                return;
            }

            // Subimos primero los cambios offline para que la lista traiga la versión más reciente
            await sincronizarPendientes();

            const respuesta = await fetchApi(`/alcancias/comunidad/${usuario.comunidad_id}`, {}, TIEMPO_ESPERA_MS);

            if (!respuesta.ok) {
                throw new Error(`El servidor respondió con estado ${respuesta.status}`);
            }
            const datos = await respuesta.json();

            // Guardamos la copia en SQLite y mostramos la lista local,
            // que también incluye las alcancías registradas offline que faltan por subir
            guardarAlcanciasServidor(datos, usuario.comunidad_id);
            cargarAlcanciasLocales(usuario.comunidad_id);
        } catch (error) {
            // Cualquier fallo (sin red, tiempo agotado, error del servidor) cae a los datos locales
            console.log('No se pudo cargar del servidor, usando SQLite:', error?.message || error);
            if (usuario) cargarAlcanciasLocales(usuario.comunidad_id);
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    };

    // Se ejecuta automáticamente al abrir la pantalla
    useFocusEffect(
        useCallback(() => {
            cargarAlcancias();
        }, [])
    );

    // Función para jalar hacia abajo y recargar
    const onRefresh = () => {
        setRefrescando(true);
        cargarAlcancias();
        setBusqueda('');
    };

    // Función para determinar qué estado mostrar basado en los booleanos de tu BD
    const obtenerInfoEstado = (item) => {
        const estado = obtenerEstado(item);
        if (estado === 'Faltante') return { texto: 'Faltante', color: '#C06C6C', fondo: 'rgba(192, 108, 108, 0.2)' }; // Rojo oscuro
        if (estado === 'Devuelta') return { texto: 'Devuelta', color: '#8FBC8F', fondo: 'rgba(143, 188, 143, 0.2)' }; // Verde sutil
        return { texto: 'Colocada', color: '#C2DFE3', fondo: 'rgba(194, 223, 227, 0.2)' }; // Celeste por defecto
    };

    //Función para la caja de busqueda
    const ejecutarBusqueda = (texto) => {
        setBusqueda(texto);
    };

    // Lista que se muestra: filtro por estado + búsqueda por nombre o número (sin importar acentos)
    const alcanciasFiltrado = useMemo(() => {
        const texto = normalizar(busqueda.trim()).replace(/^#/, '');

        return alcanciasOriginales.filter((item) => {
            if (filtroEstado !== 'Todas' && obtenerEstado(item) !== filtroEstado) return false;
            if (!texto) return true;

            const coincideNombre = normalizar(item.nombre_persona).includes(texto);
            const coincideNumero = String(item.codigo_alcancia).includes(texto);
            return coincideNombre || coincideNumero;
        });
    }, [alcanciasOriginales, busqueda, filtroEstado]);

    return {
        alcanciasFiltrado,
        busqueda,
        filtroEstado,
        setFiltroEstado,
        opcionesFiltro: OPCIONES_FILTRO,
        cargando,
        refrescando,
        onRefresh,
        ejecutarBusqueda,
        obtenerInfoEstado,
        comunidadActiva
    };
};
