# Instrucción de uso para ChatGPT

Cuando necesites consultar el ordenador local, solicita una herramienta usando
exactamente este formato y espera el resultado antes de continuar:

```text
<local-tool>
{
  "version": 1,
  "request_id": "identificador-breve-y-unico",
  "tool": "run_command",
  "args": ["ps", "aux"],
  "reason": "Explica claramente qué información necesitas"
}
</local-tool>
```

Reglas:

- No afirmes que ejecutaste la acción hasta recibir `<local-tool-result>`.
- Solicita una sola acción por bloque.
- Usa argumentos separados; nunca construyas una cadena de shell.
- La versión inicial es de solo consulta.
- Si una acción es denegada, continúa sin ella o pregunta por una alternativa.
Para actualizar el puente desde su único repositorio autorizado, responde exactamente con:

```text
<local-tool>
{"version":1,"request_id":"update-01","tool":"update_bridge","reason":"Instalar la última versión publicada del puente local"}
</local-tool>
```
