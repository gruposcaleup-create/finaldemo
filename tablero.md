# 📋 Tablero de Estado del Proyecto - Plataforma de Cursos

Este documento detalla el flujo completo de la aplicación, el estado actual de cada componente y el plan de acción para finalizar todo **HOY**.

---

## 🔄 Flujo Completo de la Aplicación

### 1. 🌐 Landing & Navegación (Público)
- **Invitado**: Puede ver la `index.html` (Landing) con carrusel y cursos destacados.
- **Catálogo**: Puede ver `courses.html` (o sección en landing) con listado de cursos.
- **Carrito**: Puede agregar cursos o la "Membresía Anual" al carrito (`cart.html`). Se guarda en el navegador (LocalStorage).

### 2. 🔐 Autenticación
- **Registro (`register.html`)**: Nombre, Apellido, Email, Password. Crea usuario en BD.
- **Login (`login.html`)**: Email, Password. Retorna usuario y rol (user/admin).
- **Recuperación (`login.html` -> Recover)**: Envía código de 6 dígitos al email (Simulado si no hay SMTP configurado).
- **Reset Password**: Valida código y actualiza contraseña.

### 3. 🛍️ Compra y Pagos
- **Carrito**: Muestra items. Valida cupón si existe.
- **Checkout**: Al dar "Comprar":
    1. Se crea sesión de Stripe Checkout en el backend.
    2. Redirige a página segura de Stripe.
    3. **Éxito**: Redirige a `/panel.html?payment_success=true`.
    4. **Webhook**: Stripe avisa al servidor (`/api/stripe/webhook`) -> El servidor marca la orden como pagada y **inscribe** al usuario en los cursos o activa la membresía.

### 4. 👤 Panel de Usuario (`panel.html`)
- **Dashboard**: Muestra estadísticas (Cursos completados, horas) y último curso visto.
- **Mis Cursos**: Lista cursos comprados.
- **Reproductor**: Al entrar a un curso, ve módulos y videos (YouTube/Vimeo embed o MP4).
- **Progreso**: Se guarda el avance automáticamente.

### 5. 🛠️ Panel de Administración (`admin.html`)
- **Cursos**: Crear, Editar, Eliminar cursos (Título, Precio, Módulos, Imagen).
- **Usuarios**: Ver lista, cambiar estado (bloquear/activar), asignar membresía manual.
- **Ventas**: Ver historial de órdenes.
- **Cupones**: Crear códigos de descuento.
- **Recursos**: Subir archivos/links para descarga.
- **Configuración**: Ajustar precio de membresía global.

---

## 🚦 Estado Actual

| Componente | Estado | Notas |
| :--- | :---: | :--- |
| **Servidor (Node.js)** | ✅ **OK** | Express, SQLite, API Routes listas. |
| **Base de Datos** | ✅ **OK** | SQLite persistente (`tienda.db`). Tablas creadas. |
| **Frontend Base** | ✅ **OK** | HTML/JS vainilla. Responsive (mayoría). |
| **Autenticación** | ✅ **OK** | Registro y Login funcionando. |
| **Cursos (CRUD)** | ✅ **OK** | Admin puede gestionar cursos y módulos JSON. |
| **Carrito** | ✅ **OK** | LocalStorage + Validación de precios en servidor. |
| **Pagos (Stripe)** | ⚠️ **Pendiente** | Código listo, falta verificar **Claves (API KEYS)**. |
| **Emails** | ⚠️ **Simulado** | Falta configurar SMTP real, usa logs en consola por ahora. |
| **Estética/UI** | 🔄 **En Proceso** | Se necesita pulir detalles visuales (Responsive tabla admin, Carrusel). |

---

## 🚀 Esquema de Resolución (PARA HOY)

Para dejar todo listo **hoy mismo**, seguiremos estos pasos estrictos:

### Paso 1: Configuración Crítica (10 min)
- [ ] **Variables de Entorno**: Asegurar que `.env` tenga las claves de Stripe correctas (Test Mode está bien para empezar).
- [ ] **Base de Datos**: Verificar que `tienda.db` no tenga datos corruptos de pruebas anteriores.

### Paso 2: Verificación de Pagos (20 min)
- [ ] **Prueba de Compra**: Realizar una compra completa en modo prueba.
- [ ] **Webhook**: Verificar que al pagar, el usuario reciba acceso inmediato (sin refresh manual).
- [ ] **Membresía**: Verificar que comprar la "Membresía Anual" active el acceso a *todos* los cursos.

### Paso 3: Pulido de UI (30 min)
- [ ] **Admin Responsive**: Verificar que la tabla de usuarios y cursos se vea bien en celular.
- [ ] **Carrusel**: Reparar flechas de navegación si están rotas.
- [ ] **Notificaciones**: Asegurar que el usuario reciba feedback visual ("Guardado", "Error", etc.).

### Paso 4: Deploy / Finalización
- [ ] **Limpieza**: Borrar usuarios/ordenes de prueba basura.
- [ ] **Backup**: Confirmar que el archivo `.db` está seguro.

---

## ⚠️ Lo que NO está andando (Known Issues)

1. **Recuperación de Contraseña Real**: Actualmente solo imprime el código en la consola del servidor. *Solución*: Si no hay SMTP, dejarlo así como "Modo Desarrollo" o usar una cuenta Gmail temporal.
2. **Webhooks en Local**: Para que Stripe avise a `localhost`, se necesita usar Stripe CLI (`stripe listen`). Si no, la redirección al panel forzará una verificación manual (ya implementada como fallback).

---
**¿Listo para ejecutar el Paso 1?**
