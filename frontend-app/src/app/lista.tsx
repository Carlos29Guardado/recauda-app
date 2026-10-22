import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useListaAlcancias } from '../hooks/useListaAlcancias';

export default function ListaAlcanciasScreen() {
  const router = useRouter();

  const {
    alcanciasFiltrado,
    busqueda,
    filtroEstado,
    setFiltroEstado,
    opcionesFiltro,
    cargando,
    refrescando,
    onRefresh,
    ejecutarBusqueda,
    obtenerInfoEstado,
    comunidadActiva
  } = useListaAlcancias();

  const hayFiltros = busqueda.trim() !== '' || filtroEstado !== 'Todas';

  // El diseño de cada tarjeta individual de la lista
  const renderItem = ({ item }: { item: any }) => {
    const estado = obtenerInfoEstado(item);

    return (
      <TouchableOpacity 
      style={styles.tarjeta} 
      activeOpacity={0.7}

      onPress={() => router.push({
          pathname: '/editar_alcancia',
          params: { 
            codigo_alcancia: item.codigo_alcancia,
            nombre_persona: item.nombre_persona,
            estado_actual: estado.texto,
            monto_actual: item.monto_entregado ? item.monto_entregado.toString() : '',
            // Para poder corregir el número si quedó repetido al sincronizar
            local_id: item.local_id,
            sync_status: item.sync_status
          }
        })}


      >

        {/* Fila superior: Código y Estado */}
        <View style={styles.tarjetaHeader}>
          <View style={styles.filaNumero}>
            <Text style={styles.numeroTexto}>#{item.codigo_alcancia}</Text>
            {/* El servidor no aceptó este número: hay que corregirlo */}
            {item.sync_status === 'conflict' && (
              <View style={styles.badgeConflicto}>
                <Ionicons name="alert-circle-outline" size={14} color="#C06C6C" />
                <Text style={styles.textoConflicto}>Número repetido</Text>
              </View>
            )}
            {/* Cambios guardados en el teléfono que aún no llegan al servidor */}
            {(item.sync_status === 'pending_insert' || item.sync_status === 'pending_update') && (
              <View style={styles.badgeSinSubir}>
                <Ionicons name="cloud-upload-outline" size={14} color="#E0B15C" />
                <Text style={styles.textoSinSubir}>Sin subir</Text>
              </View>
            )}
          </View>
          <View style={[styles.badgeEstado, { backgroundColor: estado.fondo }]}>
            <Text style={[styles.textoEstado, { color: estado.color }]}>{estado.texto}</Text>
          </View>
        </View>

        {/* Fila media: Nombre de la persona */}
        <Text style={styles.nombreTexto}>{item.nombre_persona}</Text>

        {/* Fila inferior: Monto */}
        <View style={styles.filaMonto}>
          <Text style={styles.labelMonto}>Monto:</Text>
          <Text style={[
            styles.valorMonto, 
            !item.monto_entregado && { color: '#9AA8AC', fontStyle: 'italic' }
          ]}>
            {item.monto_entregado ? `$${Number(item.monto_entregado).toFixed(2)}` : 'Pendiente'}
          </Text>
        </View>

      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botonRegresar}>
          <Ionicons name="arrow-back" size={28} color="#C2DFE3" />
        </TouchableOpacity>
        <Text style={styles.tituloHeader}>Lista de Alcancías</Text>
        <View style={{ width: 28 }} />
      </View>
      {/* Zona fija: está FUERA de la lista, así que no se mueve al hacer scroll */}
      <View style={styles.zonaFija}>
        {/* Comunidad cerrada: la campaña terminó y la lista es solo de consulta */}
        {!comunidadActiva && (
          <View style={styles.avisoCerrada}>
            <Ionicons name="lock-closed-outline" size={18} color="#E0B15C" />
            <Text style={styles.textoAvisoCerrada}>Comunidad cerrada: la campaña terminó, solo consulta.</Text>
          </View>
        )}
        {/* Barra de Búsqueda: por nombre (sin importar acentos) o por número */}
        <TextInput
          style={styles.buscador}
          placeholder="Buscar por nombre o número..."
          value={busqueda}
          placeholderTextColor="#9ca3af"
          onChangeText={(texto) => ejecutarBusqueda(texto)}
        />
        {/* Filtros por estado */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtrosScroll}
          contentContainerStyle={styles.filtros}
          keyboardShouldPersistTaps="handled"
        >
          {opcionesFiltro.map((opcion: string) => (
            <TouchableOpacity
              key={opcion}
              style={[styles.chipFiltro, filtroEstado === opcion && styles.chipFiltroActivo]}
              onPress={() => setFiltroEstado(opcion)}
            >
              <Text style={[styles.textoChip, filtroEstado === opcion && styles.textoChipActivo]}>{opcion}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {/* Cuerpo principal: solo esta parte hace scroll */}
      {cargando ? (
        <View style={styles.cargandoContainer}>
          <ActivityIndicator size="large" color="#C2DFE3" />
          <Text style={styles.textoCargando}>Cargando datos...</Text>
        </View>
      ) : (
        <FlatList
          style={styles.lista}
          data={alcanciasFiltrado}
          keyExtractor={(item, index) => item.local_id ?? index.toString()}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listaPadding}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={onRefresh}
              tintColor="#C2DFE3" 
              colors={['#1E292D']} 
              progressBackgroundColor="#C2DFE3"
            />
          }
          ListEmptyComponent={
            <View style={styles.vacioContainer}>
              <Ionicons name="file-tray-outline" size={60} color="#3A4A50" />
              <Text style={styles.textoVacio}>
                {hayFiltros ? 'Ninguna alcancía coincide con la búsqueda.' : 'No hay alcancías registradas aún.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#253237',
  },
  buscador: {
    height: 50,                 
    backgroundColor: '#1E292D', 
    color: '#FFFFFF',           
    borderWidth: 1,            
    borderColor: '#3A4A50',     
    borderRadius: 16,           
    paddingHorizontal: 16,      
    marginHorizontal: 20,       
    marginTop: 10,
    marginBottom: 15,           
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
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
  cargandoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textoCargando: {
    color: '#9AA8AC',
    marginTop: 10,
    fontSize: 16,
  },
  listaPadding: {
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  tarjetaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoPrincipal: {
    flex: 1,
  },
  numeroTexto: {
    color: '#C2DFE3',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  zonaFija: {
    // Bloque fijo arriba: no forma parte de la lista, por eso no hace scroll
    backgroundColor: '#253237',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3A4A50',
  },
  lista: {
    // Ocupa todo el espacio que queda bajo la zona fija; es lo único que hace scroll
    flex: 1,
  },
  filtrosScroll: {
    // Evita que el ScrollView horizontal se estire hacia abajo
    flexGrow: 0,
  },
  filtros: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chipFiltro: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A4A50',
    backgroundColor: '#1E292D',
  },
  chipFiltroActivo: {
    backgroundColor: '#C2DFE3',
    borderColor: '#C2DFE3',
  },
  textoChip: {
    color: '#9AA8AC',
    fontSize: 14,
    fontWeight: '600',
  },
  textoChipActivo: {
    color: '#1E292D',
  },
  badgeSinSubir: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(224, 177, 92, 0.15)',
  },
  textoSinSubir: {
    color: '#E0B15C',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  avisoCerrada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(224, 177, 92, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(224, 177, 92, 0.4)',
  },
  textoAvisoCerrada: {
    color: '#E0B15C',
    fontSize: 14,
    flex: 1,
  },
  filaNumero: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeConflicto: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(192, 108, 108, 0.2)',
  },
  textoConflicto: {
    color: '#C06C6C',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  nombreTexto: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  badgeEstado: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 10,
  },
  textoEstado: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  filaMonto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#253237',
  },
  labelMonto: {
    color: '#9AA8AC',
    fontSize: 14,
  },
  valorMonto: {
    color: '#8FBC8F',
    fontSize: 18,
    fontWeight: 'bold',
  },
  vacioContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  textoVacio: {
    color: '#9AA8AC',
    fontSize: 16,
    marginTop: 15,
  },
  item: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }
});