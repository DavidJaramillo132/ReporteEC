import sys, zipfile, re
from xml.etree import ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def cells(path, sheet_idx=0, max_rows=40):
    z=zipfile.ZipFile(path)
    names=[n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$',n)]
    names.sort()
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        r=ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in r.findall(NS+'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS+'t')))
    out=[]
    root=ET.fromstring(z.read(names[sheet_idx]))
    for row in root.iter(NS+'row'):
        vals=[]
        for c in row.findall(NS+'c'):
            v=c.find(NS+'v'); t=c.get('t')
            if v is None:
                isn=c.find(NS+'is')
                vals.append(''.join(x.text or '' for x in isn.iter(NS+'t')) if isn is not None else '')
                continue
            if t=='s': vals.append(shared[int(v.text)])
            else: vals.append(v.text or '')
        if any(x.strip() for x in vals): out.append(vals)
        if len(out)>=max_rows: break
    return names, out

p=sys.argv[1]; idx=int(sys.argv[2]) if len(sys.argv)>2 else 0
mr=int(sys.argv[3]) if len(sys.argv)>3 else 40
n,rows=cells(p, idx, mr)
print('SHEETS:', len(n))
for r in rows:
    print(' | '.join(x[:70] for x in r))
