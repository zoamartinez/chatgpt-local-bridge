# ChatGPT Local Bridge

Versión 0.2.0.

Prototipo local y auditable para conectar ChatGPT Web con herramientas de
consulta de un equipo Arch/Omarchy. Una extensión Chromium detecta solicitudes
estructuradas en las respuestas de ChatGPT, pide aprobación humana y las envía
a un Native Messaging Host local. El resultado se prepara en el compositor y
solo se remite al chat cuando la persona pulsa **Enviar**.

## Alcance

- Ejecución sin shell y sin privilegios elevados.
- Confirmación explícita para cada solicitud.
- Lista cerrada de comandos de diagnóstico.
- Tiempo máximo de 20 segundos y salida máxima de 200 KB.
- Sin escritura, borrado, instalación, `sudo` ni control automático del navegador.
- El detector espera a que el contenido deje de cambiar antes de analizarlo, para
  evitar consumo elevado de CPU durante respuestas largas.
- Actualización bajo aprobación desde un único repositorio fijado en el código.

Comandos iniciales: `ps`, `free`, `df`, `uptime`, `uname`, `lspci`, `lsusb`,
`lsblk`, `ss`, `sensors`, `hostnamectl`, `timedatectl`, `loginctl`, `upower`,
consultas con `ip`, acciones de lectura de `systemctl` y opciones acotadas de
`journalctl`.

## Instalación en Chromium

1. Clona el repositorio en una ubicación permanente:

   ```bash
   git clone https://github.com/zoamartinez/chatgpt-local-bridge.git
   cd chatgpt-local-bridge
   ```

2. Abre `chromium://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta `extension`.
5. Copia el ID de 32 letras que muestra Chromium.
6. Desde la raíz del proyecto ejecuta:

   ```bash
   chmod +x scripts/install.sh scripts/uninstall.sh
   ./scripts/install.sh ID_DE_LA_EXTENSION
   ```

7. Reinicia la aplicación web de ChatGPT de Omarchy.
8. Añade el contenido de `PROMPT.md` a las instrucciones del proyecto o úsalo
   al comienzo de una conversación.

## Actualización rápida

Pide a ChatGPT «actualiza el puente local». Aparecerá una tarjeta que indica el
repositorio exacto. Al pulsar **Autorizar una vez**, el agente comprueba que no
haya cambios locales, ejecuta exclusivamente `git pull --ff-only` desde
`zoamartinez/chatgpt-local-bridge`, actualiza el host y recarga la extensión.

La petición no puede elegir otro repositorio, rama ni comando. Si has editado
archivos en el clon, la actualización se cancela para no sobrescribirlos.

## Prueba manual

Pide a ChatGPT que emita:

```text
<local-tool>
{"version":1,"request_id":"prueba-ps","tool":"run_command","args":["ps","aux"],"reason":"Probar la consulta local de procesos"}
</local-tool>
```

Debe aparecer una tarjeta de autorización. Tras autorizar, revisa el resultado
que se prepara en el cuadro de texto y pulsa **Enviar**.

## Seguridad

Este proyecto trata toda respuesta del modelo como no confiable. La aprobación
humana es obligatoria y el agente valida de nuevo la solicitud. Aun así, revisa
cada comando y su motivo. No añadas intérpretes como `bash`, `sh`, `python`,
`node` o herramientas de escritura a la lista permitida.

No utilices esta versión para administrar servidores, manejar secretos ni
operar con privilegios de administrador.

## Desinstalación

```bash
./scripts/uninstall.sh
```

Después elimina la extensión desde `chromium://extensions`.
