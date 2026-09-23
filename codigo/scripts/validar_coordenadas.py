import sys, zipfile, re
from collections import Counter
from xml.etree import ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def rows(path, sheet=1):
    z=zipfile.ZipFile(path)
    names=sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$',n))
    sh=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        r=ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in r.findall(NS+'si'): sh.append(''.join(t.text or '' for t in si.iter(NS+'t')))
    for row in ET.fromstring(z.read(names[sheet])).iter(NS+'row'):
        d={}
        for c in row.findall(NS+'c'):
            ref=re.match(r'([A-Z]+)',c.get('r') or 'A').group(1)
            v=c.find(NS+'v'); t=c.get('t')
            if v is None: continue
            d[ref]=sh[int(v.text)] if t=='s' else (v.text or '')
        yield d
def num(s):
    s=(s or '').strip().replace(',','.')
    try: return float(s)
    except: return None
path, LA, LO, name = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
it=rows(path); 
for d in it:
    if any('provincia' in (v or '').lower() for v in d.values()): break
CONT=(-81.1,-75.2,-5.02,1.45); GAL=(-92.1,-89.2,-1.6,1.8)
tot=bad=nonnum=zero=swap=gal=0; ex=[]
for d in it:
    if not any(d.values()): continue
    tot+=1
    la,lo=num(d.get(LA)),num(d.get(LO))
    if la is None or lo is None:
        nonnum+=1
        if len(ex)<3: ex.append(('no-numerico',d.get(LA),d.get(LO)))
        continue
    if la==0 and lo==0: zero+=1; continue
    inc = CONT[0]<=lo<=CONT[1] and CONT[2]<=la<=CONT[3]
    ing = GAL[0]<=lo<=GAL[1] and GAL[2]<=la<=GAL[3]
    if ing: gal+=1; continue
    if not inc:
        # probar invertido
        if CONT[0]<=la<=CONT[1] and CONT[2]<=lo<=CONT[3]: swap+=1
        else:
            bad+=1
            if len(ex)<6: ex.append(('fuera-de-Ecuador',la,lo))
print(f'--- {name}  (filas={tot}) ---')
print(f'  no numericas / centinela : {nonnum}')
print(f'  (0,0) null island        : {zero}')
print(f'  lat/lon invertidos       : {swap}')
print(f'  Galapagos (valido)       : {gal}')
print(f'  fuera de Ecuador         : {bad}')
if ex: print('  ejemplos:', ex[:6])
