import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { actualizarAlcanciaLocal, tieneCambiosPendientes } from '../../database/sqlite';
import { sincronizarPendientes } from '../hooks/useSincronizacion';

export default function EditarAlcanciaScreen() {
    const router = useRouter();

    const { codigo_alcancia, nombre_persona, estado_actual, monto_actual } = useLocalSearchParams();

    const [monto, setMonto] = useState((monto_actual as string) || '');
    const [estado, setEstado] = useState((estado_actual as string) || 'Colocada');
    const [guardando, setGuardando] = useState(false);

    const opcionesEstado = ['Colocada', 'Devuelta', 'Faltante'];
    const manejarActualizacion = async () => {
        // Si la marcan como devuelta, idealmente debería tener un monto (aunque sea 0)
        if (estado === 'Devuelta' && !monto) {
            Alert.alert('Atención', 'Asegúrate de ingresar el monto recaudado. Si está vacía, ingresa 0.');
            return;
        }

        setGuardando(true);

        try {
            const payload = {
                colocada: estado === 'Colocada',
                devuelta: estado === 'Devuelta',
                faltante: estado === 'Faltante',
                monto_entregado: monto ? parseFloat(monto as string) : null,
            };

            // 1. Guardamos primero en el teléfono, así el cambio no se pierde aunque no haya red
            const resultadoLocal = actualizarAlcanciaLocal(Number(codigo_alcancia), payload);
            if (!resultadoLocal.exito) {
                Alert.alert('Error', resultadoLocal.error || 'No se pudo guardar el cambio en el teléfono.');
                return;
            }

            // 2. Si hay conexión, lo subimos de una vez para que lo vean los demás voluntarios
            await sincronizarPendientes();
            const subida = !tieneCambiosPendientes(Number(codigo_alcancia));

            Alert.alert(
                subida ? 'Actualizada' : 'Guardada sin conexión',
                subida
                    ? `La alcancía #${codigo_alcancia} ha sido actualizada correctamente.`
                    : `La alcancía #${codigo_alcancia} se guardó en el teléfono y se subirá automáticamente cuando haya conexión.`,
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

                {/* CAMPOS BLOQUEADOS (Solo lectura) */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Número de Alcancía</Text>
                    <TextInput
                        style={styles.inputBloqueado}
                        value={codigo_alcancia as string}
                        editable={false}
                    />
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
    inputBloqueadoVisual: { backgroundColor: '#182024', color: '#7A8C91', borderColor: '#182024' },

    radioContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    radioBoton: { flex: 1, paddingVertical: 12, backgroundColor: '#1E292D', borderWidth: 1, borderColor: '#3A4A50', borderRadius: 10, alignItems: 'center', marginHorizontal: 4 },
    radioBotonSeleccionado: { backgroundColor: '#C2DFE3', borderColor: '#C2DFE3' },
    radioTexto: { color: '#9AA8AC', fontWeight: 'bold', fontSize: 14 },
    radioTextoSeleccionado: { color: '#1E292D' },
    botonGuardar: { backgroundColor: '#C2DFE3', flexDirection: 'row', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    textoBotonGuardar: { color: '#1E292D', fontSize: 16, fontWeight: 'bold' },
});