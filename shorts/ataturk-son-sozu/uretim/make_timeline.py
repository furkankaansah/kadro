import json,sys
d=json.load(open("vo/durations.json"))
IMG=json.load(open("images.json"))
vo={"a1":0.30,"a2":2.50,"a3":5.55,
    "b1":7.15,"b2":9.70,"b3":11.40,"b4":15.05,
    "c1":19.00,"c2":21.75,"c3":25.40,"c4":26.85,
    "d1":32.60,"d2":34.20,"d3":38.55,"d4":41.00,
    "e1":44.25,"e2":45.80,"e3":48.50,"e4":50.60,
    "f1":54.75,"f2":56.20,"f3":57.45}
TXT={"a1":"Mustafa Kemal Atatürk'ün...","a2":"komaya girmeden önce söylediği *son sözü*...","a3":"biliyor musunuz?",
"b1":"*8 Kasım 1938*","b2":"*Dolmabahçe* Sarayı","b3":"Atatürk'ün sağlığı artık *son derece ağırlaşmıştı.*",
"b4":"Türkiye, *büyük önderinden* gelecek haberleri bekliyordu.",
"c1":"Yanında bulunanların aktardığına göre...","c2":"Atatürk'ün *bilinci* giderek bulanıklaşıyordu.",
"c3":"Çok geçmeden...","c4":"derin bir *komaya* girecekti.",
"d1":"*Tanıklıklara göre*...","d2":"dudaklarından dökülen *son söz*...","d4":"...oldu.",
"e1":"İki gün sonra...","e2":"*10 Kasım 1938*'de...","e3":"saat *dokuzu beş geçe*...",
"e4":"Mustafa Kemal Atatürk *hayata gözlerini yumdu.*",
"f1":"Saygıyla...","f2":"özlemle...","f3":"ve *minnetle* anıyoruz."}
subs=[]
for k,t in vo.items():
    if k not in TXT: continue
    # visible from voice onset (clip has 80ms lead) to end; hold short phrases a bit
    t0=t+0.05; t1=t+d[k]-0.05
    nxt=[v for v in vo.values() if v>t]
    t1=max(t1,t0+1.1)
    if nxt: t1=min(t1,min(nxt)-0.02)
    subs.append(dict(t0=round(t0,3),t1=round(t1,3),text=TXT[k],**({'y':1490} if k.startswith('f') else {})))
for k in vo: assert vo[k]+d[k]<=60, k
titles=[
 dict(t0=0.0,t1=6.95,text="ATATÜRK'ÜN|*SON SÖZÜ* NEYDİ?",font="Cinzel_900Black.ttf",size=104,y=330,spacing=1.12,fade_in=0.01,fade_out=0.45,anim="slowgrow"),
 dict(t0=7.25,t1=18.5,text="8 KASIM 1938|— DOLMABAHÇE —",font="Cinzel_700Bold.ttf",size=78,y=300,spacing=1.25,fade_in=0.8,fade_out=0.6,track=4),
 dict(t0=38.45,t1=43.7,text="ALEYKÜMSELÂM",font="PlayfairDisplay_700Bold.ttf",size=118,y=900,fade_in=1.1,fade_out=1.2,anim="slowgrow"),
 dict(t0=45.85,t1=54.25,text="10 KASIM 1938|*09.05*",font="Cinzel_700Bold.ttf",size=86,y=300,spacing=1.25,fade_in=0.8,fade_out=0.5,track=4),
 dict(t0=55.0,t1=60.0,text="1881 ∞ 1938",font="PlayfairDisplay_700Bold.ttf",size=96,y=640,fade_in=1.0,fade_out=0.01),
 dict(t0=56.6,t1=60.0,text="*SONSUZA DEK ATATÜRK*",font="Cinzel_900Black.ttf",size=72,y=760,fade_in=1.0,fade_out=0.01),
]
shots=IMG["shots"]
cfg=dict(vo=vo,subs=subs,titles=titles,sub_y=1330,shots=shots,flag=IMG.get("flag"),flag_on=IMG.get("flag_on"),flag_h=0.2,
         global_fade=[[59.55,60.0,"out"]])
json.dump(cfg,open("timeline.json","w"),indent=1,ensure_ascii=False)
for s in subs: print(s)
