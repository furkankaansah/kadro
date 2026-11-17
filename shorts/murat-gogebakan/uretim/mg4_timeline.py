import json, os
SEGS=json.load(open("mg4/vo/segments.json"))
G="Grave_of_Murat_Göğebakan_(cropped).jpg"
order=["A","A2","B","C","C2","D","D2","D3","E"]
extra={"C":0.5,"D":0.7,"D3":0.7,"E":0.5}
vo={}; t=0.1
for k in order:
    t+=extra.get(k,0); vo[k]=round(t,2); t+=SEGS[k]["dur"]+0.3
SPEECH_END=t
DUR=float(os.environ.get("DUR",120))
assert SPEECH_END<=DUR-1.0,(SPEECH_END,DUR)
F={
 "trees":dict(c0=[0.5,0.10],c1=[0.5,0.16],z0=1.5,z1=1.6,gain=0.8),
 "tilt":dict(c0=[0.5,0.22],c1=[0.47,0.42],z0=1.25,z1=1.05),
 "guitar":dict(c0=[0.22,0.55],c1=[0.22,0.62],z0=1.7,z1=2.0),
 "portrait_in":dict(c0=[0.455,0.40],c1=[0.455,0.40],z0=2.2,z1=2.8),
 "portrait_out":dict(c0=[0.455,0.40],c1=[0.455,0.42],z0=3.0,z1=2.3),
 "name":dict(c0=[0.3,0.25],c1=[0.7,0.25],z0=1.3,z1=1.3),
 "name_r":dict(c0=[0.7,0.25],c1=[0.3,0.25],z0=1.35,z1=1.35),
 "wide":dict(mode="fit",z0=1.0,z1=1.15,p0=0.5,p1=0.5,cy=0.5,gain=0.8),
 "wide_dark":dict(mode="fit",z0=1.15,z1=1.0,p0=0.5,p1=0.5,cy=0.5,gain=0.55),
 "clef":dict(c0=[0.75,0.5],c1=[0.75,0.55],z0=1.8,z1=2.1,gain=0.9),
 "inscr":dict(c0=[0.48,0.58],c1=[0.48,0.64],z0=1.5,z1=1.75),
 "dates":dict(c0=[0.47,0.68],c1=[0.47,0.71],z0=2.3,z1=2.7),
 "base":dict(c0=[0.5,0.78],c1=[0.5,0.72],z0=1.3,z1=1.4,gain=0.75),
 "standard":dict(c0=[0.47,0.5],c1=[0.47,0.5],z0=1.15,z1=1.0),
}
plan={"A":["trees","tilt"],"A2":["guitar"],"B":["portrait_in","name"],"C":["wide","clef","inscr"],
      "C2":["wide_dark"],"D":["portrait_out","base"],"D2":["clef","name_r"],"D3":["dates","portrait_in","standard"]}
shots=[]
for k in order[:-1]:
    st=vo[k]-0.3; en=vo[order[order.index(k)+1]]-0.2
    names=plan[k]; n=len(names); L=(en-st)/n
    for i,nm in enumerate(names):
        s=dict(img=G,t0=round(st+i*L-0.3,2),t1=round(st+(i+1)*L+0.3,2),xin=0.6,xout=0.6,**F[nm])
        shots.append(s)
shots[0]["t0"]=0; shots[0].pop("xin")
shots[-1].pop("xout"); shots[-1]["black_out"]=1.5
EA=vo["E"]
shots.append(dict(img=G,t0=round(EA+2.5,2),t1=DUR,mode="fit",z0=1.0,z1=1.06,p0=0.5,p1=0.5,cy=0.70,black_in=1.8,gain=0.45))
subs=[]
for k,st in vo.items():
    for j,p in enumerate(SEGS[k]["phrases"]):
        if k=="E" and j==0: continue
        subs.append(dict(t0=round(st+p["t0"]-0.04,3),t1=round(st+p["t1"]+0.12,3),text=p["text"]))
for a,b in zip(subs,subs[1:]):
    a["t1"]=min(max(a["t1"],a["t0"]+0.9),b["t0"]-0.03)
titles=[
 dict(t0=EA+0.7,t1=DUR,text="HAYAT İŞTE… \U0001f940",font="PlayfairDisplay_700Bold.ttf",size=92,y=380,fade_in=1.0,fade_out=0.01,anim="slowgrow"),
 dict(t0=EA+3.4,t1=DUR,text="YAŞATTIĞINI YAŞAMADAN|ANLAMIYOR İNSAN…",font="Cinzel_700Bold.ttf",size=58,y=560,spacing=1.25,fade_in=1.0,fade_out=0.01,track=2),
 dict(t0=EA+5.0,t1=DUR,text="Murat Göğebakan (1968–2014)",font="PlayfairDisplay_400Regular_Italic.ttf",size=50,y=720,fade_in=1.0,fade_out=0.01),
]
T=DUR/60
cfg=dict(vo=vo,subs=subs,titles=titles,sub_y=1360,shots=shots,grade="blue",grain=0.05,scratch_p=0.0,dust_p=0.06,
         rain=[[0,vo["B"],vo["C"],vo["C"]+3,vo["D"],vo["E"],DUR],[0.35,0.3,0.25,0.55,0.35,0.5,0.5]],global_fade=[[DUR-0.4,DUR,"out"]])
json.dump(cfg,open("mg4/timeline.json","w"),indent=1,ensure_ascii=False)
print(vo, "speech_end", round(SPEECH_END,2), "shots", len(shots))
