// Reglas para el monto recaudado de una alcancía, iguales al registrar y al editar.
// Devuelve { valido, valor, mensaje }: `valor` es el número a guardar (o null si no aplica).
export const validarMonto = (monto, estado) => {
    // Una alcancía faltante no tiene monto
    if (estado === 'Faltante') return { valido: true, valor: null };

    const texto = String(monto ?? '').trim().replace(',', '.');

    if (texto === '') {
        // Si ya la devolvieron hay que capturar cuánto traía (aunque sea 0)
        if (estado === 'Devuelta') {
            return { valido: false, mensaje: 'Ingresa el monto recaudado. Si la alcancía venía vacía, escribe 0.' };
        }
        // Colocada y aún sin recoger: el monto queda pendiente
        return { valido: true, valor: null };
    }

    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor < 0) {
        return { valido: false, mensaje: 'El monto debe ser un número válido, por ejemplo 125.50.' };
    }

    // Se guarda con 2 decimales, igual que en la base de datos del servidor
    return { valido: true, valor: Math.round(valor * 100) / 100 };
};
