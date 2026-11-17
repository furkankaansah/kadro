import json,sys,os
IG=os.environ.get('IG')=='1'
FY=1350 if IG else 1490
LY=1430 if IG else 1600
SEGS=json.load(open("vo2/segments.json"))
IMG=json.load(open("images.json"))
vo={"A":0.2,"B":7.15,"B3":16.5,"C1":20.85,"C2":27.0,"D":32.3,"E":42.4,"F":51.8}
ATA_T=56.35
subs=[]
for k,st in vo.items():
    assert st+SEGS[k]["dur"]<=59.7,k
    for p in SEGS[k]["phrases"]:
        if p["text"].rstrip(",")=="Aleykümselâm": continue
        subs.append(dict(t0=round(st+p["t0"]-0.04,3),t1=round(st+p["t1"]+0.12,3),text=p["text"],**({'y':FY} if k=="F" else {})))
subs.append(dict(t0=ATA_T+0.05,t1=ATA_T+2.75,text='*Ne mutlu Türk\'üm diyene!*',y=FY))
for a,b in zip(subs,subs[1:]):
    a["t1"]=min(max(a["t1"],a["t0"]+0.9),b["t0"]-0.03)
ALEY=vo["D"]+[p for p in SEGS["D"]["phrases"] if p["text"].rstrip(",")=="Aleykümselâm"][0]["t0"]
titles=[
 dict(t0=0.0,t1=6.95,text="ATATÜRK'ÜN|*SON SÖZÜ* NEYDİ?",font="Cinzel_900Black.ttf",size=104,y=330,spacing=1.12,fade_in=0.01,fade_out=0.45,anim="slowgrow"),
 dict(t0=7.2,t1=20.4,text="8 KASIM 1938|— DOLMABAHÇE —",font="Cinzel_700Bold.ttf",size=78,y=300,spacing=1.25,fade_in=0.8,fade_out=0.6,track=4),
 dict(t0=ALEY-0.1,t1=42.2,text="ALEYKÜMSELÂM",font="PlayfairDisplay_700Bold.ttf",size=118,y=900,fade_in=1.1,fade_out=1.2,anim="slowgrow"),
 dict(t0=43.8,t1=51.3,text="10 KASIM 1938|*09.05*",font="Cinzel_700Bold.ttf",size=86,y=300,spacing=1.25,fade_in=0.8,fade_out=0.5,track=4),
 dict(t0=ATA_T-0.1,t1=59.85,text="Atatürk'ün gerçek sesi · 10. Yıl Nutku, 1933",font="Montserrat_500Medium.ttf",size=34,y=LY,fade_in=0.5,fade_out=0.3),
 dict(t0=52.5,t1=60.0,text="1881 ∞ 1938",font="PlayfairDisplay_700Bold.ttf",size=96,y=640,fade_in=1.0,fade_out=0.01),
 dict(t0=53.9,t1=60.0,text="*SONSUZA DEK ATATÜRK*",font="Cinzel_900Black.ttf",size=72,y=760,fade_in=1.0,fade_out=0.01),
]
shots=IMG["shots"]
cfg=dict(ata=ATA_T,ticks=[7.2,20.3,1.0],vo=vo,subs=subs,titles=titles,sub_y=1330,shots=shots,flag=IMG.get("flag"),flag_on=IMG.get("flag_on"),flag_h=0.2,
         global_fade=[[59.8,60.0,"out"]])
json.dump(cfg,open("timeline.json","w"),indent=1,ensure_ascii=False)
for s in subs: print(s)
print('ALEY',ALEY)
