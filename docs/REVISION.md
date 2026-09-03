# Revisión técnica de Musicatte

> **Estado: resuelto.** Esta revisión se hizo sobre el commit `0842b7a` y todo lo que
> describe está arreglado en los commits que la siguen. Se conserva porque explica *por qué*
> el código es como es ahora: si vas a tocar el pipeline de reconocimiento o el núcleo del
> editor, lee primero el apartado correspondiente aquí.
>
> Al final hay un [registro de lo aplicado](#lo-que-se-hizo) y
> [lo que sigue pendiente](#lo-que-queda).

Revisión sobre el commit `0842b7a`. Los fallos marcados **[verificado]** se comprobaron
ejecutando el código del repositorio contra Verovio 6.3, incluida una prueba con un sistema
de dos pentagramas y el volcado del MEI que genera el motor. El resto son lecturas directas
del código, con la referencia de fichero y línea.

## Diagnóstico

Las tres quejas son reales y dos comparten una única raíz: **la aplicación no tiene ciclo de
verificación**. Digitaliza, pero no enseña qué ha entendido ni da herramientas para
corregirlo. Además hay dos fallos de autorización que dejan las partituras de todos los
usuarios al alcance de cualquier cuenta registrada.

| | |
|---|---|
| Fallos que rompen el producto | 11 |
| Líneas de preprocesado de imagen antes del OCR | 0 |
| Funciones de notación ausentes que se usan a diario | 18 |
| Formatos de exportación realmente útiles | 0 (el botón «MusicXML» descarga MEI) |

---

## 1. Por qué el reconocimiento no acierta

HOMR está entrenado con escaneos planos y bien iluminados. Ahora mismo recibe el JPEG del
móvil tal cual salió de la cámara.

### 1.1 Cero preprocesado — `homr-api.py:24-30` · **raíz del problema**

El servicio escribe los bytes subidos en disco y llama a `homr.main`. Una foto de móvil trae
rotación EXIF sin aplicar (el modelo puede estar leyendo la hoja tumbada), perspectiva
trapezoidal, curvatura del lomo, sombra de la mano, contraste bajo y resolución arbitraria.

**Arreglo:** pipeline OpenCV antes de HOMR — aplicar EXIF, escala de grises, normalizar la
iluminación dividiendo por el fondo desenfocado, detectar el cuadrilátero de la hoja y
corregir la perspectiva, corregir la inclinación con Hough sobre las líneas del pentagrama
(señal de orientación muy fiable), reescalar al interlineado que espera el modelo, binarizar
con Sauvola. Es la palanca número uno de precisión.

### 1.2 Sin guía de captura ni control de calidad — `pages/Scanner.jsx:133-144`

Es un selector de ficheros. El usuario hace una foto torcida, espera dos minutos y recibe
basura; nada le avisó.

**Arreglo:** cámara guiada con marco de encuadre y `capture="environment"`; control de calidad
en el navegador antes de subir (varianza del laplaciano para desenfoque, resolución mínima,
ángulo estimado); recorte y giro manual. Comprimir en cliente resuelve además casi todos los
errores de tamaño.

### 1.3 El resultado se valida como XML, nunca como música — `services/ocr_service.py:139-231`

`_sanitize_musicxml` fusiona `<attributes>` duplicados y quita `<notations/>` vacíos. Correcto
e irrelevante para la precisión: nadie comprueba que los compases sumen los tiempos que dice
el compás, que las notas estén en tesitura o que no haya saltos imposibles.

**Arreglo:** pase de validación musical que devuelva avisos con número de compás («compás 7:
3,5 de 4 tiempos»). No se puede hacer el OMR perfecto, pero sí que sus errores sean visibles y
rápidos de corregir. Es la función que convierte «no acierta» en «tardo dos minutos en
arreglarlo», y además da la métrica con la que medir cada cambio del pipeline.

### 1.4 No existe pantalla de repaso — Scanner → Editor

Del escáner se salta al editor; el usuario compara de memoria con el papel.

**Arreglo:** vista a dos columnas con el recorte de la foto de cada sistema junto al sistema
reconocido, y salto directo a los compases marcados. Y **reproducción MIDI**, ya disponible en
el Verovio instalado (`renderToMIDI()`): escuchar es la forma más rápida de cazar una nota mal
leída.

### 1.5 Una sola pasada, sin elegir la mejor — `services/ocr_service.py:262`

**Arreglo:** ejecutar dos o tres variantes de preprocesado y quedarse con la de mejor
consistencia rítmica según la métrica de 1.3.

### 1.6 El pipeline se come sus errores y no es reproducible — `homr-api.py:30-36`, `homr.Dockerfile:12,20`

Se invoca a HOMR manipulando `sys.argv` con `except SystemExit: pass`, así que un fallo real
se presenta como «no MusicXML produced». El `git clone` no fija commit: la precisión puede
cambiar en cada reconstrucción. `homr --init || true` oculta un fallo de descarga de modelos —
la imagen se construye bien y falla en producción.

### 1.7 Trabajos de media hora en `BackgroundTasks` — `routers/ocr.py:50`, `ocr_service.py:262-291`

Un PDF de 15 páginas se procesa en serie con 120 s de límite por página. Si reinicias el
backend el trabajo se pierde y la fila queda en `processing` para siempre. El frontend consulta
cada 2 s sin poder decir «página 3 de 12» porque nadie guarda el progreso. `uploads/` no se
limpia nunca.

**Arreglo:** cola real (Redis + arq/RQ) en un contenedor aparte escalable y llevable a GPU,
campos de progreso en el trabajo, reintentos, limpieza de subidas.

### 1.8 La separación de piezas múltiples no se dispara nunca — `ocr_service.py:113-137, 197-231`

`_is_new_piece` sólo corta si dos páginas consecutivas tienen títulos distintos y no genéricos;
HOMR casi nunca extrae título, así que todo se fusiona en una pieza y la pantalla de «piezas
detectadas» no aparece jamás. Además `_get_title` usa `identification/creator` (el compositor)
como título alternativo, y `_merge_musicxml` borra el `<attributes>` del primer compás de cada
página siguiente, tirando cambios reales de tonalidad y compás.

**Arreglo:** que el usuario confirme los cortes sobre miniaturas, con la heurística como
propuesta. Señales fiables adicionales: doble barra final, cambio en el número de pentagramas,
bloque de título detectado.

---

## 2. Por qué la web se siente complicada

El problema no es la densidad visual, que está bien resuelta: es que el trabajo principal está
repartido en cuatro pantallas sin hilo conductor, y dos de las tres secciones prometen algo
que no cumplen.

### 2.1 El repositorio comunitario no funciona de punta a punta — `routers/repository.py:38-46`, `routers/scores.py:20-22` · **[verificado]**

`GET /api/repository` devuelve sólo id, título, instrumento, género y valoración: ni partitura,
ni autor, ni compositor. Y la única forma de leer el contenido es `GET /api/scores/{id}`, que
exige ser propietario. Se puede listar y puntuar, pero **nadie puede abrir, previsualizar ni
descargar una partitura publicada**; las tarjetas de `Repository.jsx` sólo llevan botones de
estrellas, sin enlace. Se está pidiendo valorar partituras que no se pueden ver.

**Arreglo:** endpoint público de lectura para partituras `published`, más página de detalle
pública con vista previa, autor, descarga y «abrir una copia en mi editor».

### 2.2 Dos inicios distintos y un menú que cambia de significado — `App.jsx:26-30`, `Navbar.jsx:10-22`

`/` muestra Home o Dashboard según la sesión, y existe además `/dashboard` con lo mismo. En el
menú, «Editor» pasa a «Nueva» al iniciar sesión y «Mis partituras» apunta a `/`.

**Arreglo:** una ruta, un contenido. `/` siempre portada, `/mis-partituras` siempre biblioteca,
etiquetas fijas.

### 2.3 El recorrido principal son cuatro pantallas y un paso que hay que recordar — `Editor.jsx:245-250`

Escáner → editor → guardar → detalle → publicar. Publicar exige haber guardado antes; si no,
aviso de error. El sistema sabe que hay que guardar primero y aun así lo pregunta.

**Arreglo:** flujo guiado único con pasos visibles — Capturar → Revisar → Editar → Compartir.
Publicar guarda solo.

### 2.4 En el editor, la partitura es el elemento más pequeño de la pantalla — `Editor.jsx:276-437`

Ocho bloques apilados (encabezado, barra, aviso de modo insertar, barra de nota seleccionada,
lienzo, duración, alteraciones, propiedades, leyenda de atajos) y la partitura en medio con
`minHeight: 180px`.

**Arreglo:** partitura primero — lienzo a altura completa, barra compacta arriba, un único
panel contextual según la selección; en móvil, hoja inferior.

### 2.5 El modo insertar promete una cosa y hace otra — `ScoreCanvas.jsx:79-86`

El aviso dice «haz clic en cualquier compás para añadir una nota». Lo que ocurre es que se
inserta un do4 negra *al final* del compás pulsado, sin relación con el punto ni la altura del
clic.

**Arreglo:** implementarlo (Y da la altura, X la posición) o retirar el modo. Una promesa
incumplida cuesta más confianza que una función ausente.

### 2.6 Callejones sin salida y jerga en pantalla — `App.jsx:36-41`, `Scanner.jsx:97-101`

Sin sesión el menú ofrece Escáner y Editor y al pulsarlos expulsa a la pantalla de acceso. Y la
interfaz habla en el idioma del sistema: «Scanner OCR», «Job #3», «MusicXML», «MEI».

**Arreglo:** editor de prueba local sin cuenta (o etiquetar «requiere cuenta»), y lenguaje de
usuario. Los nombres de formato, sólo en el menú de exportación.

---

## 3. El editor: la arquitectura está peleándose con Verovio

Verovio 6.3 —el que ya está instalado— expone una API de edición completa:
`toolkit.edit({action: 'drag' | 'insert' | 'insertNote' | 'delete' | 'set' | 'chain'})`, con
`editStatus()` y `editResponse()` para saber si la edición fue válida, y
`redoPagePitchPosLayout()` para remaquetar sólo lo necesario. **[verificado en el paquete
instalado]**

`meiEditor.js` en cambio hace cirugía con expresiones regulares sobre la cadena MEI y tras cada
cambio recarga el documento entero y reconstruye el `innerHTML` de *todas* las páginas
(`ScoreCanvas.jsx:28-36`). Arrastrar una nota en una partitura de diez páginas vuelve a dibujar
diez páginas de SVG en cada paso del puntero. De ahí vienen la lentitud y buena parte de la
corrupción de documentos.

### Fallos confirmados

**3.1 «Exportar MusicXML» no exporta MusicXML** — `Editor.jsx:232, 261-269` · **[verificado]**
`getCurrentData()` devuelve `toolkit.getMEI()` y el fichero se descarga como `.xml` con
etiqueta «MusicXML». Verovio 6.3 no tiene salida MusicXML: sus formatos son MEI, Humdrum, MIDI,
PAE, SVG, timemap y expansion map. Lo que baja el usuario es MEI, y MuseScore, Sibelius y
Finale no lo abren. Peor: la columna de BD llamada `musicxml` contiene MEI desde el primer
guardado.

**3.2 Editar el título de una partitura guardada revienta la página** —
`musicxmlUtils.js:32-45`, `ScoreDetail.jsx:132` · **[verificado]**
Al volver al editor desde el detalle se pasa el MEI guardado a un componente que asume
MusicXML. `setTitleInMusicXML` busca `score-partwise`, obtiene `null` y `root.insertBefore`
lanza un TypeError con la primera pulsación en el campo de título. Antes de eso el título ya
aparece como «Sin título», porque MEI no tiene `work-title`.

**3.3 El título y las notas viven en documentos distintos** — `Editor.jsx:203, 238-239`
El título se escribe en el estado de React; las notas en el MEI del toolkit. Al guardar se
envía el MEI (sin el título nuevo) y una columna `title` con el título nuevo. El título se
pierde del fichero.

**3.4 Cualquier partitura de piano queda inutilizable** — `meiEditor.js:107-128, 470-495` ·
**[verificado con un grand staff real]**
`changeClef` sustituye sólo la primera coincidencia `<clef>`: nunca se puede cambiar la clave
de fa y el selector muestra siempre «Sol». Igual `changeKeySig` y `changeTimeSig`, que sólo
alcanzan al pentagrama 1. Y `addMeasureMEI` genera un `<staff n="1">` fijo, así que el compás
añadido pierde el pentagrama inferior; Verovio lo acepta sin protestar.

**3.5 Ligaduras huérfanas, compases desbordados, numeración perdida** —
`meiEditor.js:218-229, 322-355, 497-508`
`toggleTie` pone `tie="i"` sin el `tie="t"` de la nota siguiente. `insertNoteAfter` mete un do4
con la misma duración sin comprobar el presupuesto rítmico del compás.
`deleteLastMeasureMEI` borra por coincidencia de cadena (con dos compases idénticos elimina el
que no toca) y no renumera.

**3.6 Estado frágil** — `verovioEngine.js:1-26`, `Editor.jsx:38-40, 208-228`
El resultado del OCR llega por `location.state`: al recargar desaparece. No hay autoguardado ni
aviso de cambios sin guardar. El toolkit es un singleton de módulo compartido con la vista
previa del detalle, que carga otra obra encima. Los atajos de una sola letra (`i`,`r`,`t`,`n`,
`a`) se capturan globalmente y su `useEffect` sólo depende de `selectedId`, con lo que los
manejadores arrastran valores obsoletos. `useUndoRedo.js` es código muerto.

### Decisión previa a cualquier otra cosa

**Elige quién es la fuente de verdad: MEI o MusicXML.** La mitad de estos fallos existen porque
hay las dos a la vez y cada función asume una distinta.

Recomendación: **MEI como formato interno** —es el nativo de Verovio y el único que soporta su
API de edición— con un DOM MEI en memoria como única fuente de verdad, y MusicXML sólo como
entrada y salida, convertido en el backend con music21 (lee MEI, escribe MusicXML y MIDI).
Renombrar la columna de BD para que diga la verdad.

### Lo que falta, por orden de impacto

| Función | Hoy | Impacto |
|---|---|---|
| Varios pentagramas y partes | No | Bloquea piano, coro y conjunto |
| Varias voces por pentagrama | No | Bloquea polifonía y acompañamientos |
| Cambios de clave / tonalidad / compás a mitad de obra | No | Sólo el inicial, y sólo del primer pentagrama |
| Insertar y borrar compás en una posición | No | Sólo añadir al final y borrar el último |
| Grupos irregulares (tresillos) | No | Muy frecuente; hoy imposible |
| Barrado manual de corcheas | No | `cleanupBeams` sólo deshace barrados, nunca los crea |
| Ligaduras de expresión | No | Sólo de unión, y salen sin cerrar |
| Articulaciones (staccato, acento, tenuto, fermata) | No | Imprescindibles para interpretar |
| Dinámicas y reguladores | No | Igual |
| Tempo e indicación metronómica | No | Necesario también para la reproducción |
| Repeticiones, tipos de barra, casillas | No | Cualquier canción con estribillo |
| Letra (lyrics) | No | Bloquea todo el repertorio vocal |
| Reproducción MIDI | No | Ya disponible en Verovio; mejor herramienta de verificación |
| Exportar a PDF, MIDI, MusicXML, .mxl, MEI | No | Sólo un MEI mal etiquetado. PDF es lo que se imprime |
| Importar un MusicXML existente | No | Sólo se entra por OCR o en blanco |
| Selección múltiple, copiar/pegar, transponer | No | Sin esto, editar 20+ compases es inviable |
| Entrada por teclado (A–G) o teclado MIDI | No | Es como se escribe música de verdad |
| Zoom y navegación por teclado | No | Las notas son grupos SVG sólo con ratón, sin foco visible |
| Altura, duración, alteración, puntillo, acorde, silencio | Sí | La base está y funciona |
| Deshacer y rehacer | Sí | Guarda el MEI completo en cada paso, sin límite de pila |

---

## 4. Dos fallos de autorización que hay que cerrar hoy

Aparecieron al revisar el resto. Los dos son explotables por cualquier cuenta registrada.

### 4.1 Cualquier usuario puede leer las partituras de todos — `routers/scores.py:97,103`, `schemas/score.py:23-34` · **[verificado]**

En `GET /api/scores` el parámetro `mine` vale `false` por omisión y en ese caso la consulta no
filtra por usuario. `ScoreOut` incluye `musicxml`. Es decir: `GET /api/scores?page_size=100`
con cualquier token válido devuelve el contenido íntegro de los borradores de todo el mundo. El
frontend siempre manda `mine=true`, pero el endpoint está abierto.

**Arreglo:** filtrar siempre por `current_user.id` y quitar `musicxml` de la respuesta de
listado.

### 4.2 Los trabajos de OCR no tienen dueño — `routers/ocr.py:56-65`, `models/ocr_job.py:8-18` · **[verificado]**

`ocr_jobs` no tiene `user_id` y `get_job` acepta cualquier identificador (hay incluso un
`_ = current_user` que documenta que el usuario se ignora a propósito). Recorriendo
identificadores se leen las partituras escaneadas por otras personas.

**Arreglo:** añadir `user_id` con clave ajena, filtrar en la consulta y devolver 404 en lugar
de 403.

### 4.3 Higiene — `routers/ocr.py:38-41`, `config.py:11`, `requirements.txt`

El fichero se lee entero en memoria *antes* de comprobar el tamaño, y el tipo se valida sólo
por el `content-type` que envía el cliente. `requirements.txt` no fija ni una versión y mete
`pytest` en la imagen de producción. `MAX_UPLOAD_BYTES` son 8 MB en la configuración, 16 MB en
el README y en producción, y la interfaz dice 8 MB. El frontend se traga el `detail` del
servidor en un «No se pudo iniciar el OCR» genérico, así que el usuario nunca sabe que su foto
pesaba demasiado — que es justo lo que le pasa con cualquier móvil moderno.

---

## 5. Plan por fases

Ordenadas por relación entre coste y recuperación de confianza. Las fases 2 y 3 responden
directamente a «haces la foto y no acierta»: una mejora la entrada, la otra hace que el error
restante deje de doler.

**Fase 1 — Parar la hemorragia (~1 semana).** Los dos fallos de autorización. `user_id` en
`ocr_jobs`. Decidir MEI como formato interno y arreglar el título y la exportación en
consecuencia (conversión a MusicXML real en el backend). Fijar el commit de HOMR y las
versiones de las dependencias. Propagar los mensajes de error del servidor. Comprimir la imagen
en el navegador antes de subirla.

**Fase 2 — Que la foto acierte (2-3 semanas).** Pipeline de preprocesado con OpenCV. Captura
guiada con control de calidad en el navegador. Progreso por página y cola real en un contenedor
aparte. Validación rítmica con avisos por compás.

**Fase 3 — Que el error que quede se corrija en dos minutos (2-3 semanas).** Vista de repaso
con foto y resultado enfrentados. Reproducción MIDI. Salto directo entre compases marcados.
Confirmación manual del corte en documentos con varias piezas.

**Fase 4 — Un editor de verdad (3-4 semanas).** Migrar a la API `edit()` de Verovio con
remaquetado por página y un DOM MEI en memoria como única fuente de verdad; eso elimina de
golpe la cirugía con expresiones regulares y la lentitud. Después, por este orden: varios
pentagramas, tresillos, barrado, articulaciones, dinámicas, letra, repeticiones, exportación a
PDF y MIDI.

**Fase 5 — Un solo flujo y un repositorio que funcione (2 semanas).** Unificar Capturar →
Revisar → Editar → Compartir con pasos visibles. Rutas estables y etiquetas fijas. Lectura
pública de partituras publicadas con página de detalle, descarga y copia al editor propio.


---

## Lo que se hizo

Todo lo anterior está aplicado. Un resumen de las decisiones que conviene conocer, y de los
fallos que solo aparecieron al construir el arreglo.

### Decisiones

**MEI dentro, MusicXML en los bordes.** MEI es el formato nativo de Verovio y el único que
entiende su modelo de edición, así que es el que guardan el editor y la base de datos
(`scores.score_data`, con `score_format` diciendo qué es). Exportar MusicXML es una
conversión real, con music21, en el servidor.

**El recorte, no el escalado, es la palanca de precisión.** HOMR reescala toda entrada a
1920 px de ancho, así que un escalado uniforme se deshace: multiplica por igual la separación
del pentagrama y el ancho de página. Lo que sí cambia el tamaño efectivo del pentagrama es
recortar al contenido. Una primera versión del preprocesado normalizaba la escala a una
separación objetivo; HOMR lo anulaba entero.

**Cola en la base de datos, no un broker.** El reconocimiento vive en la tabla `ocr_jobs`
con `claimed_at` y `attempts`. Eso da durabilidad, reintentos y poder escalar el worker sin
añadir infraestructura. Un broker dedicado (Redis con arq o RQ) es mejor cuando hagan falta
sus funciones de planificación o reparto entre servicios, no por durabilidad, que ya está.

**Menos heurística, más confirmación.** El corte en piezas se propone a partir de barras
finales y cambios en el número de pentagramas, y lo confirma el usuario sobre las páginas.
Un corte automático equivocado es peor que ninguno.

### Fallos que aparecieron construyendo el arreglo

Ninguno de estos estaba en la revisión: salieron al probar contra el motor real, en un
navegador real y mirando las imágenes que recibe el reconocedor.

1. **Las cabezas de nota salían huecas.** El umbral adaptativo usaba una ventana del tamaño
   de una cabeza de nota, así que su interior se medía contra una media que la propia cabeza
   dominaba y se descartaba. Para el reconocedor una cabeza hueca es una blanca: cada negra
   de cada foto se leía con el doble de duración, en silencio y sin que nada en el resultado
   pareciera raro. Ahora es Otsu, que es lo correcto porque el aplanado de iluminación ya ha
   quitado el gradiente que justificaba el umbral adaptativo. Hay pruebas que miden la tinta
   dentro de la huella de cada cabeza.

2. **Un compás vacío no se podía rellenar.** Un compás nuevo llega con un silencio de compás
   completo, que cuenta como compás lleno al comprobar el ritmo — así que añadir una nota se
   rechazaba y un compás recién añadido no admitía ninguna nota nunca.

3. **El área sensible de una nota eran dos píxeles de tinta.** Un glifo de nota es pequeño y
   la plica es un pelo, así que exigir un impacto directo hacía que la mayoría de los clics
   no seleccionaran nada. Inutilizable con el dedo y molesto con el ratón. Ahora se toma la
   nota más próxima al punto, y el pentagrama tiene alcance por arriba y por abajo, que es
   donde van las notas con líneas adicionales.

4. **Mayús+clic añadía y quitaba en el mismo gesto**, porque `pointerdown` y `click` actuaban
   los dos sobre la misma pulsación. Ampliar una selección era imposible, y con ello las
   ligaduras, el barrado y los tresillos.

5. **Verovio no emite `data-n`.** El número de compás se deducía de la posición en el SVG, y
   como cada página es un SVG aparte y solo se dibujan las visibles, el primer compás de la
   página 2 se numeraba como el 1. Ahora viajan identificadores MEI.

6. **El signo del deskew estaba invertido** en la primera versión del estimador por perfil de
   proyección, así que cada pasada de refinamiento torcía más la página. Y la máscara
   morfológica horizontal que preparaba la medición borraba justamente las líneas inclinadas
   que había que medir.

7. **El motor se usaba después de destruirlo** al salir del editor, por un `ResizeObserver`
   que llegaba tarde.

8. **`[*|id="…"]` no funciona en todos los motores de selectores** (jsdom lo rechaza), así
   que buscar un elemento por `xml:id` devolvía `null` y toda edición era una operación
   nula. Ahora hay un índice.

### Cómo está cubierto

| | |
|---|---|
| `backend/tests/` | 101 pruebas: autorización, preprocesado contra páginas sintéticas de respuesta conocida, validación musical, fusión de páginas, cola |
| `frontend/src/editor/*.test.js` | 103 pruebas, incluidas 17 de integración que cargan cada tipo de documento editado en el Verovio real |
| `e2e/journey.js` | 25 comprobaciones en navegador: alta, entrada de notas por clic, edición, guardado, publicación, lectura pública y descarga |

Las pruebas de integración existen porque un documento puede tener una forma plausible y que
el motor lo rechace igualmente: es la clase de fallo que producía la edición por cadenas.

## Lo que queda

Nada de la revisión, pero sí cosas que se decidieron dejar fuera:

- **Sin migraciones de verdad.** `ensure_schema()` añade columnas y hace un relleno, y nada
  más. Hay que adoptar Alembic antes del primer cambio de esquema que eso no exprese
  (renombrar preservando datos, cambiar tipos, constraints).
- **El PDF sale por el diálogo de impresión del navegador**, no por un generador propio.
  Funciona y no añade dependencias, pero no permite control fino de la paginación.
- **La reproducción es un tono simple.** Suficiente para verificar alturas y ritmo, que es a
  lo que sirve; no es una maqueta con instrumentos, que exigiría un banco de sonidos de
  varios megas.
- **El reconocimiento no se prueba de punta a punta en CI**: necesita el contenedor de HOMR
  con sus modelos y un par de minutos por página. Lo que sí se prueba es el preprocesado y la
  validación, que son lo que decide si el reconocimiento acierta.
- **Sin entrada por teclado MIDI.** Está la entrada por letras (A–G) y por clic a la altura.
- **Sin GPU.** El Dockerfile de HOMR detecta CUDA/ROCm si están, pero no hay una variante de
  imagen preparada para ello.
