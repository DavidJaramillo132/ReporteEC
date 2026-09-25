"""Export a real 2026 sample of Ministerio del Interior data for the V1 frontend.

Until the ingestion pipeline and Martin serve tiles, the frontend reads static
files generated here from the official XLSX files (datosabiertos.gob.ec).
Nothing is invented: every feature is one official record.

Only non-personal fields are exported. Age, sex, ethnicity, nationality,
migratory status and any other attribute of the people involved are never
read into the output.

Usage:
    python3 exportar_muestra_v1.py <homicidios.xlsx> <desaparecidas.xlsx> \
        <detenidos.xlsx> <output_dir>
"""

import json
import re
import sys
import zipfile
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EXCEL_EPOCH = date(1899, 12, 30)

# Ecuador bounding boxes (continental and Galápagos), used as a safety net.
CONTINENTAL = (-81.1, -75.2, -5.02, 1.45)
GALAPAGOS = (-92.1, -89.2, -1.6, 1.8)

HOMICIDE_TYPES = {
    "homicidio": "homicidio",
    "asesinato": "homicidio",
    "sicariato": "sicariato",
    "femicidio": "femicidio",
}

SOURCES = {
    "mdi_homicidios": "https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales",
    "mdi_desaparecidas": "https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas",
    "mdi_detenidos": "https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas",
}


def read_rows(path, sheet_index=1):
    """Yield each row of a worksheet as {header: value}; data lives on sheet 2."""
    archive = zipfile.ZipFile(path)
    sheets = sorted(
        (n for n in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)),
        key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)),
    )
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root.findall(NS + "si")]

    header = None
    for row in ET.fromstring(archive.read(sheets[sheet_index])).iter(NS + "row"):
        cells = {}
        for cell in row.findall(NS + "c"):
            column = re.match(r"([A-Z]+)", cell.get("r")).group(1)
            value = cell.find(NS + "v")
            if value is None:
                continue
            cells[column] = shared[int(value.text)] if cell.get("t") == "s" else (value.text or "")
        if header is None:
            # Header names vary by dataset ("provincia", "nombre_provincia").
            if any("provincia" in v.strip().lower() for v in cells.values()):
                header = {col: v.strip().lower() for col, v in cells.items()}
            continue
        if any(v.strip() for v in cells.values()):
            yield {header[col]: v for col, v in cells.items() if col in header}


def to_float(text):
    try:
        return float((text or "").strip().replace(",", "."))
    except ValueError:
        return None


def to_date(text):
    text = (text or "").strip()
    number = to_float(text)
    if number is not None and number > 1000:
        return (EXCEL_EPOCH + timedelta(days=int(number))).isoformat()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            pass
    return None


def to_time(text):
    text = (text or "").strip()
    number = to_float(text)
    if number is not None and 0 <= number < 1:
        minutes = round(number * 24 * 60)
        return f"{minutes // 60:02d}:{minutes % 60:02d}"
    match = re.match(r"(\d{1,2}):(\d{2})", text)
    return f"{int(match.group(1)):02d}:{match.group(2)}" if match else None


def inside_ecuador(lon, lat):
    def within(box):
        return box[0] <= lon <= box[1] and box[2] <= lat <= box[3]

    return within(CONTINENTAL) or within(GALAPAGOS)


def point(lon, lat, digits=5):
    return {"type": "Point", "coordinates": [round(lon, digits), round(lat, digits)]}


def export_incidents(homicides_path, missing_path):
    features, skipped = [], Counter()

    for index, row in enumerate(read_rows(homicides_path), start=1):
        lat, lon = to_float(row.get("coordenada_y")), to_float(row.get("coordenada_x"))
        kind = HOMICIDE_TYPES.get((row.get("tipo_muerte") or "").strip().lower())
        if lat is None or lon is None or not inside_ecuador(lon, lat):
            skipped["homicidios_sin_ubicacion"] += 1
            continue
        if kind is None:
            skipped["homicidios_tipo_desconocido"] += 1
            continue
        features.append({
            "type": "Feature",
            "id": f"mdi_homicidios-{index}",
            "geometry": point(lon, lat),
            "properties": {
                "tipo": kind,
                "fecha": to_date(row.get("fecha_infraccion")),
                "hora": to_time(row.get("hora_infraccion")),
                "provincia": (row.get("provincia") or "").strip().upper(),
                "canton": (row.get("canton") or "").strip().upper(),
                "fuente": "mdi_homicidios",
                "confianza": "oficial",
            },
        })

    for index, row in enumerate(read_rows(missing_path), start=1):
        # A located person carries numeric localization coordinates; only people
        # still missing (NO_APLICA) appear on the map.
        if to_float(row.get("latitud_localizacion")) is not None:
            skipped["desaparecidas_localizadas"] += 1
            continue
        lat, lon = to_float(row.get("latitud")), to_float(row.get("longitud"))
        if lat is None or lon is None or not inside_ecuador(lon, lat):
            skipped["desaparecidas_sin_ubicacion"] += 1
            continue
        features.append({
            "type": "Feature",
            "id": f"mdi_desaparecidas-{index}",
            "geometry": point(lon, lat),
            "properties": {
                "tipo": "desaparecida",
                "fecha": to_date(row.get("fecha_desaparicion")),
                "hora": None,
                "provincia": (row.get("provincia") or "").strip().upper(),
                "canton": (row.get("canton") or "").strip().upper(),
                "fuente": "mdi_desaparecidas",
                "confianza": "oficial",
            },
        })
    return features, skipped


def export_detentions(detentions_path):
    """Aggregate detentions to a ~100 m grid: a heatmap layer needs density, not people."""
    cells = Counter()
    for row in read_rows(detentions_path):
        lat, lon = to_float(row.get("latitud")), to_float(row.get("longitud"))
        if lat is not None and lon is not None and inside_ecuador(lon, lat):
            cells[(round(lon, 3), round(lat, 3))] += 1
    return [
        {"type": "Feature", "geometry": point(lon, lat, 3), "properties": {"n": n}}
        for (lon, lat), n in cells.items()
    ], sum(cells.values())


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    homicides, missing, detentions, out_dir = sys.argv[1:]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    incidents, skipped = export_incidents(homicides, missing)
    detention_cells, detention_total = export_detentions(detentions)

    dates = sorted(f["properties"]["fecha"] for f in incidents if f["properties"]["fecha"])
    meta = {
        "generado": date.today().isoformat(),
        "periodo": {"desde": dates[0] if dates else None, "hasta": dates[-1] if dates else None},
        "conteos": dict(Counter(f["properties"]["tipo"] for f in incidents)),
        "detenidos_total": detention_total,
        "descartados": dict(skipped),
        "fuentes": SOURCES,
        "nota": "Muestra real de los archivos oficiales 2026 del Ministerio del Interior. "
        "Sin datos personales. Se reemplaza por teselas de Martin cuando exista la ingesta.",
    }

    compact = {"separators": (",", ":"), "ensure_ascii": False}
    (out / "incidentes-2026.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": incidents}, **compact), encoding="utf-8")
    (out / "detenidos-2026.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": detention_cells}, **compact), encoding="utf-8")
    (out / "meta-2026.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
