import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config/config'
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Link } from 'expo-router';
// Configuración global de Google
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID
});

export default function LoginScreen() {
  const router = useRouter();

  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const iniciarSesionNativo = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();

      // En las versiones más recientes de la librería, el token puede venir anidado en .data
      const idToken = userInfo.data?.idToken;

      const respuesta = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      const data = await respuesta.json();

      if (data.token && data.usuario) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.usuario));
        router.replace('/bienvenida');
      } else {
        Alert.alert('Error', 'No se pudo verificar el usuario en tu base de datos.');
      }
    } catch (error) {
      console.error('Error en el login nativo:', error);
      Alert.alert('Cancelado', 'El inicio de sesión fue cancelado o hubo un error.');
    }
  };

  const iniciarSesionManual = async () => {
    if (!email || !password) {
      Alert.alert('Datos incompletos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }

    try {
      // Nota: Asumo que crearás esta ruta '/login' en tu backend
      const respuesta = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await respuesta.json();

      if (data.token && data.usuario) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.usuario));
        router.replace('/bienvenida');
      } else {
        Alert.alert('Error', data.mensaje || 'Credenciales incorrectas.');
      }
    } catch (error) {
      console.error('Error en login manual:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    }
  };


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Encabezado */}
        <View style={styles.header}>
          <Text style={styles.title}>Inicio de Sesión</Text>
          <Text style={styles.subtitle}>Bienvenido a Recauda</Text>
        </View>

        {/* Campos de texto (Para futuro uso) */}
        <TextInput
          style={styles.input}
          placeholder="Correo"
          placeholderTextColor="#9DB4C0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Contraseña"
            placeholderTextColor="#9DB4C0"
            secureTextEntry={!mostrarPassword}
            value={password}
            onChangeText={setPassword}
          
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setMostrarPassword(!mostrarPassword)}
          >
            <Ionicons
              name={mostrarPassword ? 'eye-off' : 'eye'}
              size={24}
              color="#A0A0A0"
            />
          </TouchableOpacity>
        </View>

        {/* Botón Principal (Log In manual) */}
        <TouchableOpacity style={styles.primaryButton} onPress={iniciarSesionManual}>
          <Text style={styles.primaryButtonText}>Ingresar</Text>
        </TouchableOpacity>

        {/* --- NUEVO: Enlace de Registro --- */}
        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>¿No tienes una cuenta? </Text>
          <Link href="/registro_usuarios" asChild>
            <TouchableOpacity>
              <Text style={styles.registerLink}>Regístrate</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Separador "Or" */}
        <View style={styles.separatorContainer}>
          <View style={styles.line} />
          <Text style={styles.orText}>Or</Text>
          <View style={styles.line} />
        </View>

        {/* Botón de Google */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={iniciarSesionNativo}
        >
          <AntDesign name="google" size={24} color="#253237" style={styles.googleIcon} />
          <Text style={styles.googleButtonText}>Iniciar con Google</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#253237', 
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  passwordContainer: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#5C6B73', 
    borderRadius: 12,
    paddingHorizontal: 16, 
    height: 55, 
    marginBottom: 16, 
  },
  passwordInput: {
    flex: 1, 
    color: '#FFFFFF',
    fontSize: 16, 
    height: '100%',
    padding: 0, 
  },
  eyeIcon: {
    paddingLeft: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#E0FBFC', 
  },
  subtitle: {
    fontSize: 14,
    color: '#9DB4C0',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#5C6B73', 
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    marginBottom: 16,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#C2DFE3',
    borderRadius: 25,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#253237',
    fontSize: 16,
    fontWeight: 'bold',
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 35,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#9DB4C0',
    opacity: 0.5,
  },
  orText: {
    color: '#E0FBFC',
    marginHorizontal: 15,
    fontWeight: '600',
    fontSize: 16,
  },
  googleButton: {
    backgroundColor: '#E0FBFC', 
    borderRadius: 25,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    color: '#253237', 
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20, 
  },
  registerText: {
    color: '#9DB4C0',
    fontSize: 15,
  },
  registerLink: {
    color: '#E0FBFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
});