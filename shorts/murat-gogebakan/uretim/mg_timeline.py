import json
SEGS=json.load(open("mg/vo/segments.json"))
IMG=json.load(open("mg/images.json"))
vo={"A":0.15,"B":12.0,"C":24.35,"D":40.1,"E":51.95}
subs=[]
for k,st in vo.items():
    assert st+SEGS[k]["dur"]<=59.9,k
    for j,p in enumerate(SEGS[k]["phrases"]):
        if k=="E" and j==0: continue
        subs.append(dict(t0=round(st+p["t0"]-0.04,3),t1=round(st+p["t1"]+0.12,3),text=p["text"]))
for a,b in zip(subs,subs[1:]):
    a["t1"]=min(max(a["t1"],a["t0"]+0.9),b["t0"]-0.03)
titles=[
 dict(t0=53.0,t1=60.0,text="HAYAT İŞTE… \U0001f940",font="PlayfairDisplay_700Bold.ttf",size=92,y=380,fade_in=1.0,fade_out=0.01,anim="slowgrow"),
 dict(t0=55.2,t1=60.0,text="YAŞATTIĞINI YAŞAMADAN|ANLAMIYOR İNSAN…",font="Cinzel_700Bold.ttf",size=58,y=560,spacing=1.25,fade_in=1.0,fade_out=0.01,track=2),
 dict(t0=56.6,t1=60.0,text="Murat Göğebakan (1968–2014)",font="PlayfairDisplay_400Regular_Italic.ttf",size=50,y=720,fade_in=1.0,fade_out=0.01),
]
cfg=dict(vo=vo,subs=subs,titles=titles,sub_y=1360,shots=IMG["shots"],grade="blue",grain=0.05,scratch_p=0.0,dust_p=0.06,
         rain=[[0,12,24,32,40,52,60],[0.35,0.35,0.15,0.4,0.25,0.5,0.5]],global_fade=[[59.6,60.0,"out"]])
json.dump(cfg,open("mg/timeline.json","w"),indent=1,ensure_ascii=False)
for s in subs: print(s)
