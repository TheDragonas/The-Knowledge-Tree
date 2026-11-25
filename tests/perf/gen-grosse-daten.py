# Erzeugt eine grosse Test-Sicherung (4 Notizbücher, 56 Abschnitte, ein Abschnitt mit 500 Seiten) für Ladetests (1.32).
# Aufruf: python3 tests/perf/gen-grosse-daten.py VORLAGE.knowledgetree.json ZIEL.knowledgetree.json
# (die Vorlage, eine echte Sicherung, liefert die schweren Seiten)
import json, random, sys
random.seed(7)
src = json.load(open(sys.argv[1]))
real = list(src['seiten'].values())
cnt = [0]
def pid(): cnt[0] += 1; return 'pgen%07d' % cnt[0]
gc = [0]
def gid(): gc[0] += 1; return 'ggen%06d' % gc[0]
seiten = {}
def small(title, i):
    boxes = [{'id': 'b%d' % k, 'x': 40, 'y': 40 + k * 120, 'w': 420, 'html': '<p>%s – Absatz %d: %s</p>' % (title, k, 'Lorem ipsum dolor sit amet ' * 6), 'images': [], 'z': 1, 'style': {}, 'locked': False, 'pkg': None} for k in range(random.randint(1, 6))]
    dr = []
    for k in range(random.randint(0, 40)):
        x, y = random.uniform(0, 800), random.uniform(0, 1500)
        pts = []
        for j in range(30): pts += [round(x + j * 2, 1), round(y + random.uniform(-5, 5), 1), 0.5]
        dr.append({'id': 'd%d' % k, 'type': 'ink', 'kind': 'pen', 'color': '#1f1f1f', 'w': 1.4, 'layer': 'oben', 'pts': pts})
    return {'typ': 'KnowledgeTree-Seite', 'version': 1, 'title': title, 'created': 1700000000000 + i * 1000, 'modified': 1700000000000 + i * 1000, 'level': 1 if i % 7 == 3 else 0, 'bg': 'punkte', 'color': None, 'boxes': boxes, 'pkgs': [], 'links': [], 'drawings': dr}
def mkpage(title, i, heavy):
    p = json.loads(json.dumps(random.choice(real))) if heavy else small(title, i)
    p['title'] = title
    i_ = pid(); p['id'] = i_; seiten[i_] = p; return i_
groups = []
n = 0
for nb in range(4):
    secs = []
    nsec = 20 if nb == 0 else 12
    for s in range(nsec):
        npages = 500 if (nb == 0 and s == 0) else random.randint(5, 60)
        ps = []
        for k in range(npages):
            n += 1
            ps.append(mkpage('Seite %d-%d-%d' % (nb + 1, s + 1, k + 1), n, heavy=(n % 25 == 0)))
        secs.append({'id': gid(), 'name': 'Abschnitt %d.%d' % (nb + 1, s + 1), 'color': '#2d7d9a', 'kind': 'section', 'pages': ps, 'groups': []})
    groups.append({'id': gid(), 'name': 'Notizbuch %d' % (nb + 1), 'color': '#5c2d91', 'kind': 'notebook', 'pages': [], 'groups': secs})
out = {'typ': 'KnowledgeTree-Backup', 'version': 2, 'erstellt': '2026-11-04T10:00:00Z', 'name': 'Gross', 'gruppen': groups, 'seiten': seiten, 'bilder': {}}
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(seiten), sum(len(s['groups']) for s in groups))
