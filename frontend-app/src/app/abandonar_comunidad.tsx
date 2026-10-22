import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAbandonarComunidad } from '../hooks/useAbandonarComunidad';

export default function AbandonarComunidadScreen() {
  const router = useRouter();

  const {
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
    reintentar
  } = useAbandonarComunidad();

  // Con la comunidad activa, los pendientes deben subirse antes de salir
  const bloqueadoPorPendientes = pendientes > 0 && comunidadActiva;

  return (
    <View style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botonRegresar}>
          <Ionicons name="arrow-back" size={28} color="#C2DFE3" />
        </TouchableOpacity>
        <Text style={styles.tituloHeader}>Abandonar comunidad</Text>
        <View style={{ width: 28 }} />
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color="#C2DFE3" />
          <Text style={styles.textoSecundario}>Revisando que no tengas cambios sin subir...</Text>
        </View>
      ) : error ? (
        <View style={styles.centrado}>
          <Ionicons name="cloud-offline-outline" size={60} color="#3A4A50" />
          <Text style={styles.textoError}>{error}</Text>
          <TouchableOpacity style={styles.botonSecundario} onPress={reintentar}>
            <Text style={styles.textoBotonSecundario}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.contenido}>

          {/* Qué pasa al salir */}
          <View style={styles.tarjeta}>
            <Text style={styles.tituloTarjeta}>
              Vas a salir de {usuario?.comunidad_nombre || 'tu comunidad'}
            </Text>
            <Text style={styles.punto}>• Las alcancías que registraste se quedan en la comunidad.</Text>
            <Text style={styles.punto}>• Tus lotes se liberan para que el administrador los asigne a otra persona.</Text>
            <Text style={styles.punto}>• Se borran los datos de esta comunidad de tu teléfono.</Text>
            <Text style={styles.punto}>• Para volver tendrás que unirte otra vez con un código de invitación.</Text>
          </View>

          {/* Cambios sin subir */}
          {pendientes > 0 && (
            <View style={[styles.tarjeta, styles.tarjetaAviso]}>
              <Text style={styles.textoAviso}>
                {comunidadActiva
                  ? `Tienes ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin subir. Conéctate a internet y toca "Reintentar" para subirlos antes de salir.`
                  : `Tienes ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin subir que ya no se pueden subir porque la comunidad está cerrada; se borrarán al salir.`}
              </Text>
              {comunidadActiva && (
                <TouchableOpacity style={[styles.botonSecundario, { marginTop: 12 }]} onPress={reintentar}>
                  <Text style={styles.textoBotonSecundario}>Reintentar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Administrador: elegir quién se queda a cargo */}
          {esAdmin && (
            <View style={styles.tarjeta}>
              <Text style={styles.tituloTarjeta}>Nuevo administrador</Text>
              {otrosMiembros.length === 0 ? (
                <Text style={styles.descripcion}>
                  Eres el único miembro. Al salir, la comunidad quedará cerrada y archivada (no se borra ningún dato).
                </Text>
              ) : (
                <>
                  <Text style={styles.descripcion}>Elige quién se quedará a cargo de la comunidad.</Text>
                  {otrosMiembros.map((m: any) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.opcion, nuevoAdmin === m.id && styles.opcionActiva]}
                      onPress={() => setNuevoAdmin(m.id)}
                    >
                      <Ionicons
                        name={nuevoAdmin === m.id ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={nuevoAdmin === m.id ? '#C2DFE3' : '#5F6F74'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.nombreOpcion}>{m.nombre || m.email}</Text>
                        <Text style={styles.emailOpcion}>{m.email}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.botonPeligro, (procesando || bloqueadoPorPendientes) && styles.botonDeshabilitado]}
            onPress={abandonar}
            disabled={procesando}
          >
            {procesando ? (
              <ActivityIndicator color="#C06C6C" />
            ) : (
              <>
                <Ionicons name="exit-outline" size={22} color="#C06C6C" />
                <Text style={styles.textoBotonPeligro}>Abandonar comunidad</Text>
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#253237',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1E292D',
  },
  botonRegresar: {
    padding: 5,
  },
  tituloHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  textoSecundario: {
    color: '#9AA8AC',
    marginTop: 12,
    fontSize: 15,
    textAlign: 'center',
  },
  textoError: {
    color: '#9AA8AC',
    fontSize: 16,
    marginTop: 15,
    marginBottom: 20,
    textAlign: 'center',
  },
  contenido: {
    padding: 20,
    paddingBottom: 40,
  },
  tarjeta: {
    backgroundColor: '#1E292D',
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#3A4A50',
  },
  tarjetaAviso: {
    borderColor: 'rgba(224, 177, 92, 0.5)',
  },
  tituloTarjeta: {
    color: '#C2DFE3',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  punto: {
    color: '#D5DEE0',
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  descripcion: {
    color: '#9AA8AC',
    fontSize: 14,
    marginBottom: 10,
  },
  textoAviso: {
    color: '#E0B15C',
    fontSize: 14,
    lineHeight: 20,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A4A50',
    marginBottom: 8,
  },
  opcionActiva: {
    borderColor: '#C2DFE3',
    backgroundColor: 'rgba(194, 223, 227, 0.08)',
  },
  nombreOpcion: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  emailOpcion: {
    color: '#9AA8AC',
    fontSize: 12,
    marginTop: 2,
  },
  botonSecundario: {
    borderWidth: 1,
    borderColor: '#C2DFE3',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  textoBotonSecundario: {
    color: '#C2DFE3',
    fontSize: 15,
    fontWeight: '600',
  },
  botonPeligro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#C06C6C',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 5,
  },
  textoBotonPeligro: {
    color: '#C06C6C',
    fontSize: 16,
    fontWeight: 'bold',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
