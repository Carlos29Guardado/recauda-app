import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { actualizarAlcanciaLocal, tieneCambiosPendientes, corregirNumeroConflicto, obtenerSiguienteCodigoLocal } from '../../database/sqlite';
import { sincronizarPendientes } from '../hooks/useSincronizacion';
import { fetchApi, comunidadEstaActiva } from '../services/api';
import { validarMonto } from '../services/validaciones';

export default function EditarAlcanciaScreen() {
    const router = useRouter();

    const { codigo_alcancia, nombre_persona, estado_actual, monto_actual, local_id, sync_status } = useLocalSearchParams();

    // Si el servidor rechazó el número (otro colaborador ya lo usó) se le asigna uno nuevo automáticamente
    const enConflicto = sync_status === 'conflict';
    const [numeroCorregido, setNumeroCorregido] = useState((codigo_alcancia as string) || '');
    const [asignandoNumero, setAsignandoNumero] = useState(false);

    // Calcula el siguiente número libre de la comunidad (igual que al registrar): el mayor entre
    // el que indica el servidor y el siguiente guardado en el teléfono. Necesita internet.
    const asignarNuevoNumero = async () => {
        setAsignandoNumero(true);
        try {
            const usuario = JSON.parse((await AsyncStorage.getItem('userData')) || '{}');
            const respuesta = await fetchApi(`/alcancias/siguiente/${usuario.comunidad_id}`, {}, 8000);
            const data = await respuesta.json();

            if (!respuesta.ok) {
                Alert.alert('Error', data.error || 'No se pudo calcular el nuevo número.');
                return;
            }
            if (data.limite_alcanzado) {
                Alert.alert('Sin números disponibles', 'Ya se registraron todas las alcancías del rango de tu comunidad.');
                return;
            }

            const siguienteLocal = obtenerSiguienteCodigoLocal(usuario.comunidad_id, data.rango_inicio);
            const nuevo = Math.max(data.siguiente_codigo, siguienteLocal);
            if (data.rango_fin != null && nuevo > Number(data.rango_fin)) {
                Alert.alert('Sin números disponibles', 'Ya se registraron todas las alcancías del rango de tu comunidad.');
                return;
            }
            setNumeroCorregido(String(nuevo));
        } catch (error) {
            Alert.alert('Sin conexión', 'Necesitas internet para asignar un nuevo número, así no se repite con el de otro colaborador.');
        } finally {
            setAsignandoNumero(false);
        }
    };

    const [monto, setMonto] = useState((monto_actual as string) || '');
    const [estado, setEstado] = useState((estado_actual as string) || 'Colocada');
    const [guardando, setGuardando] = useState(false);

    const opcionesEstado = ['Colocada', 'Devuelta', 'Faltante'];
    const manejarActualizacion = async () => {
        const usuarioSesion = JSON.parse((await AsyncStorage.getItem('userData')) || '{}');
        if (!comunidadEstaActiva(usuarioSesion)) {
            Alert.alert('Comunidad cerrada', 'La campaña terminó: las alcancías solo se pueden consultar.');
            return;
        }

        // Mismas reglas del monto que al registrar (Devuelta exige monto, aunque sea 0)
        const montoValidado = validarMonto(monto, estado);
        if (!montoValidado.valido) {
            Alert.alert('Monto inválido', montoValidado.mensaje);
            return;
        }

        setGuardando(true);

        try {
            const payload = {
                colocada: estado === 'Colocada',
                devuelta: estado === 'Devuelta',
                faltante: estado === 'Faltante',
                monto_entregado: montoValidado.valor,
            };

            let codigo = Number(codigo_alcancia);

            // 0. Si estaba en conflicto, primero se corrige el número
            if (enConflicto) {
                const nuevo = Number(numeroCorregido);
                if (nuevo === Number(codigo_alcancia)) {
                    Alert.alert('Número repetido', 'Primero toca "Asignar nuevo número" para darle un número que no esté usado.');
                    return;
                }
                const correccion = corregirNumeroConflicto(local_id as string, nuevo);
                if (!correccion.exito) {
                    Alert.alert('Error', correccion.error || 'No se pudo corregir el número.');
                    return;
                }
                codigo = nuevo;
            }

            // 1. Guardamos primero en el teléfono, así el cambio no se pierde aunque no haya red
            const resultadoLocal = actualizarAlcanciaLocal(codigo, payload);
            if (!resultadoLocal.exito) {
                Alert.alert('Error', resultadoLocal.error || 'No se pudo guardar el cambio en el teléfono.');
                return;
            }

            // 2. Si hay conexión, lo subimos de una vez para que lo vean los demás voluntarios
            await sincronizarPendientes();
            const subida = !tieneCambiosPendientes(codigo);

            Alert.alert(
                subida ? 'Actualizada' : 'Guardada sin conexión',
                subida
                    ? `La alcancía #${codigo} ha sido actualizada correctamente.`
                    : `La alcancía #${codigo} se guardó en el teléfono y se subirá automáticamente cuando haya conexión.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (error) {
            console.error('Error al actualizar:', error);
            Alert.alert('Error', 'No se pudo guardar el cambio.');
        } finally {
            setGuardando(false);
        };
    };
    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.botonRegresar}>
                    <Ionicons name="arrow-back" size={28} color="#C2DFE3" />
                </TouchableOpacity>
                <Text style={styles.tituloHeader}>Recolección</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView style={styles.formContainer}>

                {/* CAMPOS BLOQUEADOS (Solo lectura), salvo el número si quedó en conflicto */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Número de Alcancía</Text>
                    {enConflicto ? (
                        <>
                            <TextInput
                                style={styles.inputBloqueado}
                                value={numeroCorregido}
                                editable={false}
                            />
                            <Text style={styles.avisoConflicto}>
                                {numeroCorregido === codigo_alcancia
                                    ? 'Otro colaborador ya registró este número. Toca el botón para asignarle el siguiente número disponible.'
                                    : `Se le asignará el número ${numeroCorregido}. Toca "Guardar Cambios" para confirmar.`}
                            </Text>
                            <TouchableOpacity
                                style={[styles.botonAsignar, asignandoNumero && { opacity: 0.7 }]}
                                onPress={asignarNuevoNumero}
                                disabled={asignandoNumero}
                            >
                                {asignandoNumero ? (
                                    <ActivityIndicator color="#C2DFE3" />
                                ) : (
                                    <Text style={styles.textoBotonAsignar}>Asignar nuevo número</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TextInput
                            style={styles.inputBloqueado}
                            value={codigo_alcancia as string}
                            editable={false}
                        />
                    )}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Asignada a</Text>
                    <TextInput
                        style={styles.inputBloqueado}
                        value={nombre_persona as string}
                        editable={false}
                    />
                </View>

                {/* CAMPOS EDITABLES */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Actualizar Estado</Text>
                    <View style={styles.radioContainer}>
                        {opcionesEstado.map((opcion) => (
                            <TouchableOpacity
                                key={opcion}
                                style={[
                                    styles.radioBoton,
                                    estado === opcion && styles.radioBotonSeleccionado
                                ]}
                                onPress={() => {
                                    setEstado(opcion);
                                    if (opcion === 'Faltante') setMonto('');
                                }}
                            >
                                <Text style={[styles.radioTexto, estado === opcion && styles.radioTextoSeleccionado]}>
                                    {opcion}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Monto Recaudado ($)</Text>
                    <TextInput
                        style={[styles.input, estado === 'Faltante' && styles.inputBloqueadoVisual]}
                        placeholder={estado === 'Faltante' ? "No aplica" : "0.00"}
                        placeholderTextColor="#9AA8AC"
                        keyboardType="decimal-pad"
                        value={monto}
                        onChangeText={setMonto}
                        editable={estado !== 'Faltante'}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.botonGuardar, guardando && { opacity: 0.7 }]}
                    onPress={manejarActualizacion}
                    disabled={guardando}
                >
                    {guardando ? (
                        <ActivityIndicator color="#1E292D" />
                    ) : (
                        <>
                            <Text style={styles.textoBotonGuardar}>Guardar Cambios</Text>
                            <Ionicons name="checkmark-circle-outline" size={20} color="#1E292D" style={{ marginLeft: 8 }} />
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#253237' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#1E292D' },
    botonRegresar: { padding: 5 },
    tituloHeader: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
    formContainer: { padding: 24, flex: 1 },
    inputGroup: { marginBottom: 20 },
    label: { color: '#C2DFE3', fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 4 },

    input: { backgroundColor: '#1E292D', color: '#FFFFFF', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#3A4A50' },

    inputBloqueado: { backgroundColor: '#182024', color: '#9AA8AC', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#253237' },
    avisoConflicto: { color: '#C06C6C', fontSize: 13, marginTop: 6, marginLeft: 4 },
    botonAsignar: { marginTop: 10, borderWidth: 1, borderColor: '#C2DFE3', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    textoBotonAsignar: { color: '#C2DFE3', fontSize: 15, fontWeight: '600' },
    inputBloqueadoVisual: { backgroundColor: '#182024', color: '#7A8C91', borderColor: '#182024' },

    radioContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    radioBoton: { flex: 1, paddingVertical: 12, backgroundColor: '#1E292D', borderWidth: 1, borderColor: '#3A4A50', borderRadius: 10, alignItems: 'center', marginHorizontal: 4 },
    radioBotonSeleccionado: { backgroundColor: '#C2DFE3', borderColor: '#C2DFE3' },
    radioTexto: { color: '#9AA8AC', fontWeight: 'bold', fontSize: 14 },
    radioTextoSeleccionado: { color: '#1E292D' },
    botonGuardar: { backgroundColor: '#C2DFE3', flexDirection: 'row', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    textoBotonGuardar: { color: '#1E292D', fontSize: 16, fontWeight: 'bold' },
});