"""Kullanım: python3 gorsel_listele.py "Nikola Tesla" [alt-kategori derinliği 0/1]
Commons kategorisindeki görselleri lisanslarıyla listeler."""
import sys
from wiki import category_files, subcats, file_info, OK_LICENSE

cat = sys.argv[1]; depth = int(sys.argv[2]) if len(sys.argv) > 2 else 1
cats = [cat] + (subcats(cat) if depth else [])
for c in cats:
    names = category_files(c, 100)
    if not names:
        continue
    print(f"\n### {c}")
    info = file_info(names)
    for n in names:
        i = info.get(n)
        if not i or min(i["w"], i["h"]) < 500:
            continue
        flag = "OK " if OK_LICENSE.search(i["license"] or "") else "?? "
        print(f"{flag}{i['w']}x{i['h']}\t{i['license'][:14]}\t{n}")
