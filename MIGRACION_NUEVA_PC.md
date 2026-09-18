# 🚀 Guía Completa de Migración: Jobflow Dashboard a una Nueva Computadora

Esta guía detalla paso a paso cómo trasladar y poner en funcionamiento este proyecto en tu nueva computadora con **Antigravity**.

---

## 📌 Datos Clave del Proyecto
* **Repositorio en GitHub:** `https://github.com/92Augusto/jobflow-dashboard.git`
* **Rama principal:** `main`
* **Base de Datos & Auth:** Firebase (`agrimensura-b6a6a`) — *ya está integrada en el código (`src/lib/firebase.ts`), no requiere variables de entorno `.env` manuales*.
* **Hosting en Producción:** Cloudflare Workers / Pages (`https://jobflow.valentinottiaugusto.workers.dev`).

---

## 🛠️ Paso 1: Programas Necesarios en la Nueva Computadora

Antes de abrir el proyecto, asegurate de tener instalado lo siguiente:

1. **Node.js (LTS v20 o v22):**
   * Descargar desde: [https://nodejs.org](https://nodejs.org)
   * Durante la instalación, dejá todas las opciones por defecto.
   * Para verificar que quedó bien instalado, abrí una terminal (PowerShell o CMD) y escribí:
     ```bash
     node -v
     npm -v
     ```
2. **Git:**
   * Descargar desde: [https://git-scm.com](https://git-scm.com)
   * Instalalo con las opciones predeterminadas.
3. **Google Antigravity:**
   * Tener instalado y abierto Antigravity en la nueva máquina.

---

## 📥 Paso 2: Descargar el Proyecto en la Nueva Computadora

Tenés **dos opciones** para pasar los archivos:

### Opción A (Recomendada: Vía GitHub)
1. Abrí la terminal (PowerShell) en la carpeta donde guardás tus proyectos (por ejemplo, `C:\Users\<TuUsuario>\Documents`):
   ```bash
   git clone https://github.com/92Augusto/jobflow-dashboard.git
   ```
2. Entrá a la carpeta del proyecto:
   ```bash
   cd jobflow-dashboard
   ```

### Opción B (Vía Pendrive o Google Drive)
Si preferís copiar la carpeta desde esta computadora:
1. Copiá la carpeta `jobflow-dashboard`.
   > ⚠️ **IMPORTANTE:** NO copies las carpetas `node_modules` ni `dist` (pesan gigas y contienen miles de archivos temporales que se reconstruyen automáticamente).
2. Pegá la carpeta en tu nueva computadora (por ejemplo, en `Documentos\jobflow-dashboard`).

---

## 💻 Paso 3: Abrir el Proyecto en Antigravity

1. Abrí **Antigravity**.
2. Hacé clic en **File** > **Open Folder...** (o *Abrir Carpeta*).
3. Seleccioná la carpeta `jobflow-dashboard`.
4. ¡Listo! Antigravity detectará el proyecto automáticamente.

---

## 📦 Paso 4: Instalar las Dependencias

Dentro de Antigravity (abriendo la terminal integrada con `` Ctrl + ` ``) o desde PowerShell dentro de la carpeta del proyecto, ejecutá:

```bash
npm install
```

> Este comando descargará automáticamente todas las librerías necesarias (`React`, `TanStack Start`, `Firebase`, `Tailwind CSS`, `Lucide`, etc.).

---

## ⚡ Paso 5: Comandos de Uso Frecuente

### 1. Iniciar en modo desarrollo local (para probar en tu PC):
```bash
npm run dev
```
Abrí tu navegador en `http://localhost:3000`.

### 2. Compilar para producción (con generación de Service Worker offline):
```bash
npm run build
```
*(Este comando compila la app y automáticamente ejecuta `build-sw.js` para crear el `sw.js` que permite usar la app sin internet).*

### 3. Publicar cambios a Cloudflare (Producción):
1. La primera vez en la máquina nueva, iniciá sesión en Cloudflare:
   ```bash
   npx wrangler login
   ```
   *(Se abrirá una ventana en tu navegador para que autorices con tu cuenta de Cloudflare).*
2. Para desplegar la versión actualizada:
   ```bash
   npx wrangler deploy
   ```

### 4. Guardar cambios en GitHub:
```bash
git add .
git commit -m "Descripción de los cambios"
git push
```

---

## 🔄 ¿Cómo continuar con el Asistente Antigravity?
En tu nueva computadora, simplemente abrís Antigravity, abrís la carpeta `jobflow-dashboard`, y ya podés chatear con el agente. El agente leerá todo el código actualizado y sabrá exactamente en qué estado se encuentra el proyecto.
