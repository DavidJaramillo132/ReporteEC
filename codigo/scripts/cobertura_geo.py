import sys, zipfile, re
from xml.etree import ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def rows(path):
    z=zipfile.ZipFile(path)
    names=sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$',n))
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        r=ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in r.findall(NS+'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS+'t')))
    root=ET.fromstring(z.read(names[int(__import__('os').environ.get('SHEET','0'))]))
    for row in root.iter(NS+'row'):
        d={}
        for c in row.findall(NS+'c'):
            ref=re.match(r'([A-Z]+)',c.get('r') or 'A').group(1)
            v=c.find(NS+'v'); t=c.get('t')
            if v is None: continue
            d[ref]=shared[int(v.text)] if t=='s' else (v.text or '')
        yield d
def colidx(ref):
    n=0
    for ch in ref: n=n*26+(ord(ch)-64)
    return n
path=sys.argv[1]
it=rows(path)
hdr=None
for d in it:
    vals=[x.lower().strip() for x in d.values()]
    if any('provincia' in v or 'canton' in v or 'latitud' in v or 'coordenada' in v for v in vals):
        hdr={k:v.strip().lower() for k,v in d.items()}; break
print('HEADER:', sorted(hdr.values(), key=lambda x: 0))
geo={k:v for k,v in hdr.items() if re.search(r'latitud|longitud|coordenada',v)}
print('GEO COLS:', geo)
total=0; filled={k:0 for k in geo}; samples={k:[] for k in geo}
for d in it:
    if not any(d.values()): continue
    total+=1
    for k in geo:
        v=(d.get(k) or '').strip()
        if v and v.upper() not in ('SIN DATO','NULL','NA','N/A','0'):
            filled[k]+=1
            if len(samples[k])<5: samples[k].append(v)
print('FILAS DE DATOS:', total)
for k in geo:
    pct = 100*filled[k]/total if total else 0
    print(f'  {hdr[k]:24s} pobladas={filled[k]:7d} ({pct:5.1f}%)  ej={samples[k][:4]}')
