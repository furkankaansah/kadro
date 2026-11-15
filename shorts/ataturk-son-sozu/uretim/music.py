import numpy as np, wave
SR=48000; T=60.0; N=int(SR*T)
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def mtof(m): return 440*2**((m-69)/12)
def add(sig,start,pan=0.0,gain=1.0):
    i=int(start*SR); j=min(N,i+len(sig)); s=sig[:j-i]*gain
    L[i:j]+=s*np.sqrt(0.5*(1-pan)); R[i:j]+=s*np.sqrt(0.5*(1+pan))
def piano(m,dur=4.0,vel=0.6):
    f=mtof(m); n=int(dur*SR); t=np.arange(n)/SR; s=np.zeros(n)
    B=0.0004
    for k in range(1,12):
        fk=f*k*np.sqrt(1+B*k*k)
        if fk>16000: break
        amp=(1/k**1.15)*(0.6+0.4*vel)**(k*0.35)
        dec=1.2+0.9*k*(f/440)**0.5
        s+=amp*np.sin(2*np.pi*fk*t+rng.uniform(0,6.28))*np.exp(-t*dec*0.55)
    # two-stage decay + soft hammer attack
    env=np.minimum(1,t/0.004)*(0.7*np.exp(-t*1.1)+0.3*np.exp(-t*0.25))
    rel=np.ones(n); rn=int(0.25*SR); rel[-rn:]=np.linspace(1,0,rn)
    return s*env*rel*vel
def strings(m,dur,att=1.6,rel=1.8):
    f=mtof(m); n=int(dur*SR); t=np.arange(n)/SR; s=np.zeros(n)
    for det in (-0.09,-0.03,0.04,0.1):
        vib=1+0.0025*np.sin(2*np.pi*(5.1+det)*t+rng.uniform(0,6))*np.minimum(1,t/1.5)
        ph=2*np.pi*np.cumsum(f*(1+det/100*3)*vib)/SR
        for k in range(1,9):
            s+=np.sin(k*ph)/k*(0.82**k)
    env=np.minimum(1,t/att)*np.minimum(1,(dur-t)/rel).clip(0,1)
    return s*env/6
# Am  F  C  G | Am  Dm  E  Am | F  G  Em Am | F  E  Am(sus)
prog=[ (57,[45,57,60,64]),(53,[41,57,60,65]),(48,[48,55,60,64]),(55,[43,55,59,62]),
       (57,[45,57,60,64]),(50,[38,57,62,65]),(52,[40,56,59,64]),(57,[45,57,60,64]),
       (53,[41,57,60,65]),(55,[43,55,59,62]),(52,[40,55,59,64]),(57,[45,57,60,64]),
       (53,[41,57,60,65]),(52,[40,56,59,64]),(57,[45,57,60,64]),(57,[45,57,60,64])]
BAR=4.0
melody={ # bar: list of (beat, midi, len)
 4:[(0,76,2),(2,74,1),(3,72,1)], 5:[(0,74,3),(3,72,1)], 6:[(0,71,2),(2,68,2)], 7:[(0,69,4)],
 8:[(0,72,1.5),(1.5,74,0.5),(2,76,2)], 9:[(0,74,2),(2,71,2)], 10:[(0,71,1),(1,72,1),(2,74,2)], 11:[(0,76,4)],
 12:[(0,77,2),(2,76,1),(3,74,1)], 13:[(0,71,2),(2,68,2)], 14:[(0,69,4)],
}
for b,(root,ch) in enumerate(prog):
    t0=b*BAR
    if t0>=T: break
    # piano broken chord (arpeggio up), soft
    arp=[ch[0],ch[1]+12-12,ch[2],ch[3],ch[2],ch[1]+12]
    for k,m in enumerate([ch[0],ch[1],ch[2],ch[3],ch[2]+12 if b>=8 else ch[2],ch[3]]):
        st=t0+k*(BAR/6)+rng.uniform(-0.01,0.01)
        add(piano(m,3.2,0.38+0.06*(k==0)),st,pan=-0.25+0.1*k,gain=0.5)
    # strings pad from bar 2
    if b>=2:
        g=0.10 if b<7 else (0.22 if b<12 else 0.16)
        for m in ch[1:]:
            add(strings(m,BAR+1.2),t0-0.2,pan=rng.uniform(-0.5,0.5),gain=g)
        add(strings(ch[0]-12 if ch[0]>40 else ch[0],BAR+1.2),t0-0.2,gain=g*0.9)  # cello/bass
    if b in melody:
        for beat,m,ln in melody[b]:
            add(piano(m,ln+1.6,0.55),t0+beat,pan=0.15,gain=0.55)
        # violin doubling melody an octave lower from bar 8, swell
        if b>=8:
            for beat,m,ln in melody[b]:
                add(strings(m,ln+0.5,att=0.5,rel=0.6),t0+beat,pan=0.3,gain=0.12)
# Single soft low note at title and at the key moment
add(piano(33,5,0.7),0.0,gain=0.6); add(piano(45,5,0.5),0.0,gain=0.4)
# simple stereo reverb: convolve with decaying noise IR
def reverb(x,seed):
    r=np.random.default_rng(seed); n=int(2.6*SR); t=np.arange(n)/SR
    ir=r.standard_normal(n)*np.exp(-t*2.4); ir[:int(0.012*SR)]=0
    # lowpass IR
    k=np.ones(8)/8; ir=np.convolve(ir,k,'same'); ir/=np.sqrt((ir**2).sum())
    from numpy.fft import rfft,irfft
    m=len(x)+n; F=1<<(m-1).bit_length()
    return irfft(rfft(x,F)*rfft(ir,F),F)[:len(x)]
wL=reverb(L,1); wR=reverb(R,2)
L2=0.72*L+0.45*wL; R2=0.72*R+0.45*wR
# dynamics: soft until 30s, swell 30-48, sustain, fade last 10s
t=np.arange(N)/SR
env=np.interp(t,[0,3,28,32,46,50,58,60],[0.55,0.55,0.62,0.85,1.0,0.95,0.25,0.0])
L2*=env; R2*=env
st=np.stack([L2,R2],1); st/=np.abs(st).max()*1.12
st=np.tanh(st*1.2)/np.tanh(1.2)
with wave.open("music.wav","wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st*32000).astype('<i2').tobytes())
print("ok")
