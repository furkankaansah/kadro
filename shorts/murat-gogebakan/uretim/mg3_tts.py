"""Natural narration: each sentence synthesised whole (natural intonation, no pitch shifting),
then dramatic pauses inserted between words using word-boundary timings.
Markup:  {0.4} = insert 0.4 s pause after previous word,  |  = subtitle phrase break,  *x* = red keyword,
         <slow>word</slow> = gently time-stretch that word."""
import asyncio, edge_tts, os, re, json, subprocess, numpy as np, wave
P=os.environ["HTTPS_PROXY"]
TTSMAP={"Göğebakan":"Göebakan"}
def ttsw(w):
    for a_,b_ in TTSMAP.items(): w=w.replace(a_,b_)
    return w
V="en-US-AndrewMultilingualNeural"; SR=48000
SEG={
 "A":("-8%","Bir zamanlar onun da bir yuvası vardı… {0.5}| Bir eşi, bir evladı, {0.15}| birlikte kurulmuş *hayalleri…* {0.6}| Ama bazı hikâyeler, {0.2}| verilen *sözlerin bittiği yerde* yarım kalır."),
 "A2":("-7%","Mardin'de doğan bir çocuktu o. {0.35}| Sesindeki o *yanık tını,* {0.2}| yaşadığı her acının izini taşıyordu."),
 "B":("-6%","*Murat Göğebakan,* {0.2}| ilk evliliğinin ardından başka bir hayata adım attı. {0.4}| Yeniden sevdi, {0.2}| yeniden inandı. {0.5}| Şarkılarında anlattığı o *büyük aşkı,* {0.2}| bu kez kendi hayatında yaşayacağını sandı."),
 "C":("-7%","Ama hayat, {0.2}| ona en ağır sınavını hazırlıyordu: {0.35}| amansız bir *kanser.* {0.7}| Hastane odalarında geçen uzun günler başladı. {0.45}| Basına yansıyan iddialara göre, {0.2}| hastanede geçirdiği *208 günün* {0.2}| yalnızca *3 gününde* {0.2}| ikinci eşi yanındaydı."),
 "C2":("-8%","Sahnelerde binlerce kişiye şarkı söyleyen o adam, {0.35}| hastane odasında, {0.25}| *yapayalnızdı.*"),
 "D":("-8%","Hastalık yeniden geldiğinde ise, {0.4}| onu yalnız bırakmayan, {0.3}| yıllar önce ayrıldığı *ilk eşiydi.* {0.7}| Bir zamanlar ardında bıraktığı o kadın, {0.25}| en zor gününde, {0.2}| elini *hiç bırakmadı.*"),
 "D2":("-8%","İnsan bazen bir kalbin nasıl kırıldığını, {0.2}| *kendi kalbi kırılınca* anlar. {0.6}| Bazı ayrılıklar *sessizdir…* {0.5}| Ama bıraktığı iz, {0.2}| bir ömür *silinmez.*"),
 "D3":("-8%","*31 Temmuz 2014'te,* {0.3}| henüz *45 yaşındayken,* {0.3}| Murat Göğebakan hayata gözlerini yumdu. {0.6}| Geriye, {0.25}| yarım kalmış şarkılar, {0.2}| ve yarım kalmış bir *aşk hikâyesi* kaldı."),
 "E":("-9%","*Hayat işte…* {0.5}| Bazen insan, {0.15}| başkasına yaşattığı acının ne demek olduğunu {0.1}| *yıllar sonra* anlar."),
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
    for _try in range(6):
        try: return await _synth(key,rate,text)
        except edge_tts.exceptions.NoAudioReceived: await asyncio.sleep(3)
    raise RuntimeError('no audio '+key)
async def _synth(key,rate,text):
    c=edge_tts.Communicate(text,V,rate=rate,proxy=P,boundary="WordBoundary")
    b=[]; 
    with open(f"mg3/vo/{key}.mp3","wb") as f:
        async for ch in c.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary": b.append((ch["text"],ch["offset"]/1e7,ch["duration"]/1e7))
    return b
def load(p):
    raw=subprocess.run(["ffmpeg","-v","error","-i",p,"-ar",str(SR),"-ac","1","-f","s16le","-"],capture_output=True).stdout
    return np.frombuffer(raw,'<i2').astype(np.float32)/32768
def stretch(a,factor):
    tmp="mg3/vo/_s.wav"; out="mg3/vo/_o.wav"
    with wave.open(tmp,"wb") as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((a*32767).astype('<i2').tobytes())
    subprocess.run(["ffmpeg","-y","-v","error","-i",tmp,"-af",f"atempo={factor}",out],check=True)
    return load(out)
out={}
async def main():
    for key,(rate,markup) in SEG.items():
        toks=words_of(markup)
        plain=" ".join(ttsw(t[1]) for t in toks if t[0]=="w").replace("…",",").replace(",,",",")
        bnd=await synth(key,rate,plain)
        ws=[t for t in toks if t[0]=="w"]
        norm=lambda x: re.sub(r"[^\wçğıöşüâÇĞİÖŞÜÂ']","",x.lower())
        nb=[]; wi_=0
        for bt,bo,bd in bnd:
            target=norm(bt).replace(" ",""); grp=[]; acc=""
            while wi_<len(ws) and len(acc)<len(target):
                grp.append(ws[wi_]); acc+=norm(ttsw(ws[wi_][1])); wi_+=1
            assert acc==target,(key,bt,acc)
            L=sum(max(1,len(norm(w[1]))) for w in grp); o=bo
            for w in grp:
                d=bd*max(1,len(norm(w[1])))/L; nb.append((w[1],o,d)); o+=d
        assert len(nb)==len(ws),(key,len(nb),len(ws)); bnd=nb
        a=load(f"mg3/vo/{key}.mp3")
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
        with wave.open(f"mg3/vo/{key}.wav","wb") as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((y*32767).astype('<i2').tobytes())
        ph=[]
        for p in phrases:
            if not p: continue
            txt=" ".join(("*"+words[i][0]+"*") if words[i][1] else words[i][0] for i in p).replace("* *"," ")
            ph.append(dict(t0=words[p[0]][2],t1=words[p[-1]][3],text=txt))
        out[key]=dict(dur=len(y)/SR,phrases=ph)
        print(key,round(len(y)/SR,2),[(x["text"],round(x["t0"],2),round(x["t1"],2)) for x in ph])
asyncio.run(main())
json.dump(out,open("mg3/vo/segments.json","w"),indent=1,ensure_ascii=False)
