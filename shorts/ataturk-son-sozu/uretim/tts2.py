"""Natural narration: each sentence synthesised whole (natural intonation, no pitch shifting),
then dramatic pauses inserted between words using word-boundary timings.
Markup:  {0.4} = insert 0.4 s pause after previous word,  |  = subtitle phrase break,  *x* = red keyword,
         <slow>word</slow> = gently time-stretch that word."""
import asyncio, edge_tts, os, re, json, subprocess, numpy as np, wave
P=os.environ["HTTPS_PROXY"]; V="en-US-BrianMultilingualNeural"; SR=48000
SEG={
 "A":("-2%","Mustafa Kemal Atatürk'ün, {0.25}| komaya girmeden önce söylediği *son sözü*, {0.45}| biliyor musunuz?"),
 "B":("-4%","*8 Kasım 1938,* {0.45}| *Dolmabahçe* Sarayı. {0.35}| Atatürk'ün sağlığı artık *son derece ağırlaşmıştı.*"),
 "B3":("-2%","Türkiye, *büyük önderinden* gelecek haberleri bekliyordu."),
 "C1":("-2%","Yanında bulunanların aktardığına göre, {0.2}| Atatürk'ün *bilinci* giderek bulanıklaşıyordu."),
 "C2":("-4%","Çok geçmeden, {0.45}| derin bir *komaya* girecekti."),
 "D":("-5%","*Tanıklıklara göre,* {0.35}| dudaklarından dökülen *son söz,* {1.7}| <slow>Aleykümselâm,</slow> {0.45}| oldu."),
 "E":("-3%","İki gün sonra, {0.2}| *10 Kasım 1938'de,* {0.15}| saat *dokuzu beş geçe,* {0.45}| Mustafa Kemal Atatürk, *hayata gözlerini yumdu.*"),
 "F":("-6%","Saygıyla, {0.4}| özlemle, {0.3}| ve *minnetle* anıyoruz."),
}
def words_of(markup):
    """returns list of tokens: ('w', display_word, red, slow) / ('p', secs) / ('br',)"""
    toks=[]; red=False; slow=False
    for m in re.finditer(r"\{([\d.]+)\}|\||<slow>|</slow>|\S+",markup):
        s=m.group(0)
        if m.group(1): toks.append(("p",float(m.group(1)))); continue
        if s=="|": toks.append(("br",)); continue
        if s=="<slow>": slow=True; continue
        if s=="</slow>": slow=False; continue
        # word possibly with * markers and inline slow tags
        sl = slow or "<slow>" in s
        s2=s.replace("<slow>","").replace("</slow>","")
        if s2.startswith("*"): red=True
        r=red
        if s2.endswith("*") or s2.endswith("*,") or s2.endswith("*."): red=False
        toks.append(("w",s2.replace("*",""),r,sl))
        if "</slow>" in s: slow=False
    return toks
async def synth(key,rate,text):
    c=edge_tts.Communicate(text,V,rate=rate,proxy=P,boundary="WordBoundary")
    b=[]; 
    with open(f"vo2/{key}.mp3","wb") as f:
        async for ch in c.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary": b.append((ch["text"],ch["offset"]/1e7,ch["duration"]/1e7))
    return b
def load(p):
    raw=subprocess.run(["ffmpeg","-v","error","-i",p,"-ar",str(SR),"-ac","1","-f","s16le","-"],capture_output=True).stdout
    return np.frombuffer(raw,'<i2').astype(np.float32)/32768
def stretch(a,factor):
    tmp="vo2/_s.wav"; out="vo2/_o.wav"
    with wave.open(tmp,"wb") as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((a*32767).astype('<i2').tobytes())
    subprocess.run(["ffmpeg","-y","-v","error","-i",tmp,"-af",f"atempo={factor}",out],check=True)
    return load(out)
out={}
async def main():
    for key,(rate,markup) in SEG.items():
        toks=words_of(markup)
        plain=" ".join(t[1] for t in toks if t[0]=="w")
        bnd=await synth(key,rate,plain)
        ws=[t for t in toks if t[0]=="w"]
        norm=lambda x: re.sub(r"[^\wçğıöşüâÇĞİÖŞÜÂ']","",x.lower())
        nb=[]; wi_=0
        for bt,bo,bd in bnd:
            target=norm(bt).replace(" ",""); grp=[]; acc=""
            while wi_<len(ws) and len(acc)<len(target):
                grp.append(ws[wi_]); acc+=norm(ws[wi_][1]); wi_+=1
            assert acc==target,(key,bt,acc)
            L=sum(max(1,len(norm(w[1]))) for w in grp); o=bo
            for w in grp:
                d=bd*max(1,len(norm(w[1])))/L; nb.append((w[1],o,d)); o+=d
        assert len(nb)==len(ws),(key,len(nb),len(ws)); bnd=nb
        a=load(f"vo2/{key}.mp3")
        # trim leading silence to 60 ms before first word
        st=max(0,int((bnd[0][1]-0.06)*SR)); 
        bnd=[(t,o-st/SR,d) for t,o,d in bnd]; a=a[st:]
        pieces=[]; cursor=0; tshift=0.0; words=[]; wi=-1; phrases=[[]]
        for t in toks:
            if t[0]=="w":
                wi+=1; o,d=bnd[wi][1],bnd[wi][2]
                if t[3]:  # slow word: cut word region, stretch
                    s0=int(o*SR); s1=int((o+d+0.03)*SR)
                    pieces.append(a[cursor:s0]); seg=stretch(a[s0:s1],0.86)
                    ramp=np.linspace(0.92,0.82,len(seg)); pieces.append(seg*ramp)
                    extra=len(seg)/SR-(s1-s0)/SR; cursor=s1
                    words.append((t[1],t[2],o+tshift,o+tshift+len(seg)/SR)); tshift+=extra
                else:
                    words.append((t[1],t[2],o+tshift,o+d+tshift))
                phrases[-1].append(len(words)-1)
            elif t[0]=="p":
                # cut in the gap after word wi
                end=bnd[wi][1]+bnd[wi][2]; nxt=bnd[wi+1][1] if wi+1<len(bnd) else end+0.2
                cut=int(max(end,nxt-0.02)*SR)
                if cut>cursor:
                    pieces.append(a[cursor:cut]); cursor=cut
                pieces.append(np.zeros(int(t[1]*SR),np.float32)); tshift+=t[1]
            else: phrases.append([])
        # keep 0.25 s tail after last word
        endw=bnd[-1][1]+bnd[-1][2]+0.25
        pieces.append(a[cursor:int(endw*SR)])
        y=np.concatenate(pieces); f=int(0.01*SR); y[-f:]*=np.linspace(1,0,f)
        with wave.open(f"vo2/{key}.wav","wb") as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((y*32767).astype('<i2').tobytes())
        ph=[]
        for p in phrases:
            if not p: continue
            txt=" ".join(("*"+words[i][0]+"*") if words[i][1] else words[i][0] for i in p).replace("* *"," ")
            ph.append(dict(t0=words[p[0]][2],t1=words[p[-1]][3],text=txt))
        out[key]=dict(dur=len(y)/SR,phrases=ph)
        print(key,round(len(y)/SR,2),[(x["text"],round(x["t0"],2),round(x["t1"],2)) for x in ph])
asyncio.run(main())
json.dump(out,open("vo2/segments.json","w"),indent=1,ensure_ascii=False)
