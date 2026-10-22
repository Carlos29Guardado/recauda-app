import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi, comunidadEstaActiva } from '../services/api';
import { validarMonto } from '../services/validaciones';
import { guardarAlcanciaLocal, obtenerSiguienteCodigoLocal } from '../../database/sqlite'; 

export const useRegistroAlcancia = () => {
    const [numeroAlcancia, setNumeroAlcancia] = useState('');
    const [rangoInicio, setRangoInicio] = useState(null);
    const [rangoFin, setRangoFin] = useState(null);
    const [cargandoInicial, setCargandoInicial] = useState(true);

    const [nombrePersona, setNombrePersona] = useState('');
    const [monto, setMonto] = useState('');
    const [estado, setEstado] = useState('Colocada');
    const [guardando, setGuardando] = useState(false);
    //Candado para que un doble toque rápido no registre la misma alcancía dos veces
    const registrando = useRef(false);

    const opcionesEstado = ['Colocada', 'Devuelta', 'Faltante'];

    useEffect(() => {
        const obtenerDatosSector = async () => {
            try {
                const usuarioString = await AsyncStorage.getItem('userData');
                if (!usuarioString) return;

                const usuario = JSON.parse(usuarioString);
                const inicioSector = usuario.rango_inicio || 1;

                if (usuario.rango_inicio) setRangoInicio(Number(usuario.rango_inicio));
                if (usuario.rango_fin) setRangoFin(Number(usuario.rango_fin));

                const siguienteLocal = obtenerSiguienteCodigoLocal(usuario.comunidad_id, inicioSector);

                try {
                    const respuesta = await fetchApi(`/alcancias/siguiente/${usuario.comunidad_id}`, {}, 8000);
                    if (respuesta.ok) {
                        const data = await respuesta.json();

                        // Guardamos el rango en la sesión para poder validar el número sin conexión
                        // (al crear o unirse a una comunidad el rango no se guarda hasta el siguiente login)
                        if (data.rango_inicio != null && data.rango_fin != null) {
                            setRangoInicio(Number(data.rango_inicio));
                            setRangoFin(Number(data.rango_fin));
                            await AsyncStorage.setItem('userData', JSON.stringify({
                                ...usuario,
                                rango_inicio: data.rango_inicio,
                                rango_fin: data.rango_fin
                            }));
                        }

                        if (data.limite_alcanzado) {
                            // Ya no quedan números en el rango de la comunidad
                            setNumeroAlcancia('');
                        } else {
                            const numeroFinal = Math.max(data.siguiente_codigo, siguienteLocal);
                            setNumeroAlcancia(numeroFinal.toString());
                        }
                    } else {
                        setNumeroAlcancia(siguienteLocal.toString());
                    }
                } catch (networkError) {
                    setNumeroAlcancia(siguienteLocal.toString());
                }
            } catch (error) {
                console.error('Erro al inicializar la pantalla:', error);
            } finally {
                setCargandoInicial(false);
            }
        };
        obtenerDatosSector();
    }, []);
    const manejarRegistro = async () => {
    if (registrando.current) return;
    registrando.current = true;
    setGuardando(true);

    try {

      const usuarioString = await AsyncStorage.getItem('userData');

      if (!usuarioString) {
        Alert.alert('Error de Sesión', 'No se encontraron datos del usuario');
        return;
      }

      const usuario = JSON.parse(usuarioString);

      if (!comunidadEstaActiva(usuario)) {
        Alert.alert('Comunidad cerrada', 'La campaña terminó: ya no se pueden registrar alcancías en esta comunidad.');
        return;
      }

      // El número se calcula automáticamente; si está vacío es que ya se usó todo el rango
      const codigo = Number(numeroAlcancia);
      if (!numeroAlcancia || !Number.isInteger(codigo)) {
        Alert.alert('Sin números disponibles', 'Ya se registraron todas las alcancías del rango de tu comunidad.');
        return;
      }
      if (rangoInicio != null && rangoFin != null && (codigo < rangoInicio || codigo > rangoFin)) {
        Alert.alert(
          'Fuera de rango',
          `El número ${codigo} no pertenece a tu comunidad. Las alcancías de tu comunidad van de la ${rangoInicio} a la ${rangoFin}.`
        );
        return;
      }

      // No se permite registrar sin el nombre de la persona a quien se entrega
      const nombre = nombrePersona.trim();
      if (nombre.length < 2) {
        Alert.alert('Falta el nombre', 'Escribe el nombre de la persona a quien se le entrega la alcancía.');
        return;
      }

      const montoValidado = validarMonto(monto, estado);
      if (!montoValidado.valido) {
        Alert.alert('Monto inválido', montoValidado.mensaje);
        return;
      }

      const payload = {
        codigo_alcancia: codigo,
        nombre_persona: nombre,
        comunidad_id: usuario.comunidad_id,
        usuario_id: usuario.id,
        colocada: estado === 'Colocada' ? 1 : 0,
        devuelta: estado === 'Devuelta' ? 1 : 0,
        faltante: estado === 'Faltante' ? 1 : 0,
        monto_entregado: montoValidado.valor,
      };

      const resultadoLocal = guardarAlcanciaLocal(payload);

      if (resultadoLocal && resultadoLocal.exito) {
        Alert.alert(
          'Éxito',
          `Alcancía #${numeroAlcancia} guardada localmente.`,
          [{
            text: 'Siguiente',
            onPress: () => {
              setNombrePersona('');
              setMonto('');
              setEstado('Colocada');
              // Sugerimos el siguiente número, sin pasarnos del rango
              const siguienteNumero = codigo + 1;
              setNumeroAlcancia(rangoFin != null && siguienteNumero > rangoFin ? '' : siguienteNumero.toString());
            }
          }]
        );
      } else {
        Alert.alert('Error', resultadoLocal?.error || 'No se pudo guardar el registro localmente.');
      }
    } catch (error) {
      console.error('Error al registrar la alcancía:', error);
      Alert.alert('Error', 'Ocurrió un problema al registrar la alcancía. Intenta de nuevo.');
    } finally {
      registrando.current = false;
      setGuardando(false);
    }
  };

    return {
        numeroAlcancia,
        rangoInicio,
        rangoFin,
        nombrePersona, setNombrePersona,
        monto, setMonto,
        estado, setEstado,
        opcionesEstado,
        cargandoInicial,
        guardando,
        manejarRegistro,
        opcionesEstado
    };



}