- La aplicacion tendra un stack (aun sin definir)
- Base de datos Postgres y PostGIS
- Va a ser PWA para poder lanzarlo en Web y  Movil (Si escala y va todo bien se creara una app nativa para movil) 
- Se usara MapLibre GL JS 
- Se mostrara el nivel de confianza de cada noticia, incidente, y de donde fue sacada la informacion
- Los usuarios podran hacer reportes ciudadanos de incidentes (Accidentes de transito, robos, peleas, denuncias, disparos, etc), pero solo desde la version de Movil
- Cuando quiera subir un incidente, lo hara anonimanente, el movil le pedira los datos de su ubicacion para ponerla, y llegar una formulario con, que paso, y una pequena descripcion de lo que paso, podra subir una foto si el quiere
- Se usara un buket para imagenes
- Si hubo un incidente cerca de su ubicacion, se le noticara, especialmente si estas en celular
- Para desplegar se usar caddy
- Se usara Godaddy 
- Buket y VPS (maquina virtual con ubuntu server), por ahora por Azure pero en un futuro se usara AWS
- Se tendra que optimar la subida de imagenes
- plataforma de datos geoespaciales
- sistema de ingesta (Data Engineering, ETL / ELT)
- visualización en tiempo casi real.
- La pagina dara la opcion de elegir entre, los ultimos 4 años y Actualidad (casi real)
- Seccion de estadisticas
- Dividido por categoria
- Se podra filtrar por:
	- 2025 2026 Por provincia Por cantón Por tipo Por mes
- En el lateral derecha en la parte de abajo, aparecera una notificacion de que se registo un nuevo incidente, el aspecto debe de ser parecido a:
	- 🟡 Accidente Portoviejo Hace 25 min Fuente: ...

	

***De donde sacar la info***
Siempre usar los datos mas actualzado 
**Personas Desaparecias:**
- https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas
**Personas Detenidas y aprendidas**
- https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas
**Homicidios Intencionales**
- https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales
**Homicidios Por accidentes de transito  (Revisa)**
- https://www.datosabiertos.gob.ec/dataset/fallecidos-por-accidentes-de-transito-registradas-por-el-sppat
**Denuncias y noticias de la Policia**
- https://noticias.policia.gob.ec/ (El apartado de "Ultimas")

***Nivel de confianza***

| Estado         | Significado                           |
| -------------- | ------------------------------------- |
| 🟢 Oficial     | Fuente institucional                  |
| 🔵 Verificado  | Confirmado mediante múltiples fuentes |
| 🟡 Reportado   | Existe una fuente periodística        |
| 🟠 En revisión | Información pendiente de verificar    |
| ⚪ Histórico    | Dato estadístico/histórico            |

Nota: ⚪ Histórico, es para cuando se el usuario ponga un año anterior al actual
