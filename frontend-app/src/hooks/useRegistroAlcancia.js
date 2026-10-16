import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config/config';
import { guardarAlcanciaLocal, obtenerSiguienteCodigoLocal } from '../../database/sqlite'; 

export const useRegistroAlcancia = () => {
    const [numeroAlcancia, setNumeroAlcancia] = useState('');
    const [rangoFin, setRangoFin] = useState(null);
    const [cargandoInicial, setCargandoInicial] = useState(true);

    const [nombrePersona, setNombrePersona] = useState('');
    const [monto, setMonto] = useState('');
    const [estado, setEstado] = useState('Colocada');
    const [guardando, setGuardando] = useState(false);

    const opcionesEstado = ['Colocada', 'Devuelta', 'Faltante'];

    useEffect(() => {
        const obtenerDatosSector = async () => {
            try {
                const usuarioString = await AsyncStorage.getItem('userData');
                if (!usuarioString) return;

                const usuario = JSON.parse(usuarioString);
                const rangoInicio = usuario.rango_inicio || 1;

                if (usuario.rango_fin) {
                    setRangoFin(usuario.rango_fin); 
                }

                const siguienteLocal = obtenerSiguienteCodigoLocal(usuario.comunidad_id, rangoInicio);

                try {
                    const respuesta = await fetch(`${API_URL}/alcancias/siguiente/${usuario.comunidad_id}`)
                    if (respuesta.ok) {
                        const data = await respuesta.json();

                        const siguienteServer = data.siguiente_codigo;
                        const numeroFinal = Math.max(siguienteServer, siguienteLocal);

                        setNumeroAlcancia(numeroFinal.toString());
                        if (data.rango_fin) setRangoFin(data.rango_fin);
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
    try {
      Alert.alert("Debug", "1. Entró a manejarRegistro");

      const usuarioString = await AsyncStorage.getItem('userData');
      Alert.alert("Debug", `2. Usuario leído: ${usuarioString ? 'Sí' : 'No'}`);

      if (!usuarioString) {
        Alert.alert('Error de Sesión', 'No se encontraron datos del usuario');
        return;
      }

      const usuario = JSON.parse(usuarioString);

      const payload = {
        codigo_alcancia: parseInt(numeroAlcancia, 10),
        nombre_persona: nombrePersona,
        comunidad_id: usuario.comunidad_id,
        usuario_id: usuario.id,
        colocada: estado === 'Colocada' ? 1 : 0,
        devuelta: estado === 'Devuelta' ? 1 : 0,
        faltante: estado === 'Faltante' ? 1 : 0,
        monto_entregado: monto ? parseFloat(monto) : null,
      };

      Alert.alert("Debug", "3. Llamando a guardarAlcanciaLocal...");
      const resultadoLocal = guardarAlcanciaLocal(payload);
      Alert.alert("Debug", `4. Resultado: ${JSON.stringify(resultadoLocal)}`);

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
              const siguienteNumero = parseInt(numeroAlcancia, 10) + 1;
              setNumeroAlcancia(siguienteNumero.toString());
            }
          }]
        );
      } else {
        Alert.alert('Error', 'No se pudo guardar el registro localmente.');
      }
    } catch (error) {
      // AQUÍ ESTÁ EL TRUCO: Mostramos el error real en la pantalla del cel
      Alert.alert('Error Crítico Catched', error.message || JSON.stringify(error));
    } finally {
      setGuardando(false);
    }
  };

    return {
        numeroAlcancia,
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