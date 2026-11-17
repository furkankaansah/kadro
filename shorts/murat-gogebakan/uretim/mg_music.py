import numpy as np, wave, sys
OUT=sys.argv[1] if len(sys.argv)>1 else 'music.wav'
SR=48000; T=float(__import__('os').environ.get('DUR',60)); N=int(SR*T)
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def mtof(m): return 440*2**((m-69)/12)
def add(sig,start,pan=0.0,gain=1.0):
    i=int(start*SR)
    if i>=N: return
    j=min(N,i+len(sig)); s=sig[:j-i]*gain
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
Dm=[38,50,53,57]; Bb=[34,50,53,58]; F=[41,53,57,60]; C=[36,52,55,60]; Gm=[43,50,55,58]; A=[45,52,57,61]; Am=[45,52,57,60]
base=[Dm,Bb,F,C, Dm,Gm,A,Dm, Bb,C,Am,Dm, Gm,A,Dm,Dm]
import math
nb=math.ceil(T/4)+1
seq=base[:12]+(base[4:12]*10)
seq=seq[:max(0,nb-4)]+[Gm,A,Dm,Dm]
prog=[(0,c) for c in seq]
BAR=4.0
melody={
 2:[(0,69,2),(2,72,1),(3,70,1)], 3:[(0,67,3),(3,69,1)],
 4:[(0,65,2),(2,64,1),(3,62,1)], 5:[(0,67,3),(3,65,1)], 6:[(0,64,2),(2,61,2)], 7:[(0,62,4)],
 8:[(0,74,2),(2,72,1),(3,70,1)], 9:[(0,72,3),(3,76,1)], 10:[(0,76,2),(2,72,2)], 11:[(0,74,4)],
 12:[(0,70,2),(2,69,1),(3,67,1)], 13:[(0,69,2),(2,73,2)], 14:[(0,74,4)],
}
for b,(root,ch) in enumerate(prog):
    t0=b*BAR
    if t0>=T: break
    # piano broken chord (arpeggio up), soft
    arp=[ch[0],ch[1]+12-12,ch[2],ch[3],ch[2],ch[1]+12]
    for k,m in enumerate([ch[0],ch[1]+12,ch[2]+12,ch[3]+12,ch[2]+12,ch[1]+12]):
        st=t0+k*(BAR/6)+rng.uniform(-0.01,0.01)
        add(piano(m,3.4,0.34+0.08*(k==0)),st,pan=-0.25+0.1*k,gain=0.45)
    # strings pad from bar 2
    if b>=4:
        g=0.07 if t0<T*0.13 else (0.16 if t0<T*0.82 else 0.10)
        for m in ch[1:]:
            add(strings(m,BAR+1.2),t0-0.2,pan=rng.uniform(-0.5,0.5),gain=g)
        add(strings(ch[0]-12 if ch[0]>40 else ch[0],BAR+1.2),t0-0.2,gain=g*0.9)  # cello/bass
    mb = b if b < 12 else (b-12)%8+4
    if b>=len(prog)-4: mb = 12+(b-(len(prog)-4))
    if mb in melody:
        for beat,m,ln in melody[mb]:
            add(piano(m,ln+1.6,0.55),t0+beat,pan=0.15,gain=0.55)
        # violin doubling melody an octave lower from bar 8, swell
        if 8<=mb<=13 and b>=8:
            for beat,m,ln in melody[mb]:
                add(strings(m,ln+0.5,att=0.5,rel=0.6),t0+beat,pan=0.3,gain=0.12)
# Single soft low note at title and at the key moment
add(piano(26,6,0.6),0.0,gain=0.5); add(piano(38,6,0.45),0.0,gain=0.35)
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
env=np.interp(t,np.array([0,3,24,32,44,52,58.5,60])*T/60,[0.6,0.6,0.7,0.85,1.0,0.9,0.35,0.0])
L2*=env; R2*=env
st=np.stack([L2,R2],1); st/=np.abs(st).max()*1.12
st=np.tanh(st*1.2)/np.tanh(1.2)
# rain ambience: filtered noise bed + random droplets
rr=np.random.default_rng(11)
from scipy.signal import lfilter, butter
bb,aa=butter(2,[400/(SR/2),7000/(SR/2)],btype="band")
bed=lfilter(bb,aa,rr.standard_normal((N,2)),axis=0).astype(np.float32)
bed*= (0.75+0.25*np.sin(2*np.pi*0.07*np.arange(N)/SR))[:,None]
drops=np.zeros((N,2),np.float32)
for _ in range(2600):
    i=int(rr.integers(0,N-2000)); L_=int(rr.integers(200,900)); tt=np.arange(L_)/SR
    d=np.sin(2*np.pi*rr.uniform(1500,5000)*tt)*np.exp(-tt*rr.uniform(150,400))*rr.uniform(0.2,1)
    ch=int(rr.integers(0,2)); drops[i:i+L_,ch]+=d
rain=bed/np.abs(bed).max()*0.22+drops/np.abs(drops).max()*0.10
rain_env=np.interp(t,np.array([0,1.5,25,36,52,57,60])*T/60,[0.9,0.9,0.5,0.9,0.6,1.2,0.0])[:,None]
st=st+rain*rain_env
st/=np.abs(st).max()*1.05
with wave.open(OUT,"wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st*32000).astype('<i2').tobytes())
print("ok")
