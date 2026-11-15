import numpy as np, wave, json, subprocess
SR=48000; N=SR*60
tl=json.load(open("timeline.json"))["vo"]
def rd(p):
    w=wave.open(p); a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32768
    return a.reshape(-1,w.getnchannels()) if w.getnchannels()>1 else a
vo=np.zeros(N,np.float32)
for k,t in tl.items():
    a=rd(f"vo2/{k}.wav")
    g=1.0
    i=int(t*SR); vo[i:i+len(a)]+=a[:N-i]*g
# gentle warmth: low-shelf-ish via adding lowpassed copy, light compression
def onepole(x,fc):
    a=np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.0
    from scipy.signal import lfilter
    return lfilter([1-a],[1,-a],x).astype(np.float32)
try:
    import scipy
except ImportError:
    subprocess.run(["pip","install","-q","scipy"]); import scipy
lo=onepole(vo,180); vo=vo+0.35*lo
# short room reverb (documentary booth feel, very subtle)
rng=np.random.default_rng(3); n=int(0.6*SR); t=np.arange(n)/SR
ir=rng.standard_normal(n)*np.exp(-t*9); ir[:int(0.008*SR)]=0; ir/=np.sqrt((ir**2).sum())
from scipy.signal import fftconvolve
vo=vo+0.06*fftconvolve(vo,ir)[:N].astype(np.float32)
# compressor (RMS, 3:1 over -20 dBFS)
env=np.sqrt(fftconvolve(vo**2,np.ones(int(0.02*SR))/int(0.02*SR),'same').clip(1e-10))
db=20*np.log10(env+1e-9); over=np.maximum(0,db+20); gr=10**(-(over*(1-1/3))/20)
vo=vo*gr; vo/=np.abs(vo).max()+1e-9; vo*=0.89
# music + ducking
mus=rd("music.wav")
venv=np.sqrt(fftconvolve(vo**2,np.ones(int(0.05*SR))/int(0.05*SR),'same').clip(0))
act=(venv>0.02).astype(np.float32)
# smooth attack 80ms / release 600ms
from scipy.signal import lfilter
def smooth(x,tc): a=np.exp(-1/(tc*SR)); return lfilter([1-a],[1,-a],x)
duck_amt=np.maximum(smooth(act,0.08),smooth(act,0.6)*0.9)
mus_gain=10**((-12.5 - 7*duck_amt)/20)   # -17 dB bed, -23 dB under voice
mus=mus*mus_gain[:,None]
# clock ticks 7.0-18.6s (quiet), and a soft low impact at 38.45 (before the word)
tick=np.zeros(N,np.float32)
for k,tt in enumerate(np.arange(7.2,19.8,1.0)):
    i=int(tt*SR); m=int(0.03*SR); tt_=np.arange(m)/SR
    s=(np.sin(2*np.pi*3100*tt_)*0.6+np.sin(2*np.pi*1700*tt_)*0.4)*np.exp(-tt_*180)
    tick[i:i+m]+=s*(0.06 if k%2==0 else 0.045)
st=np.stack([vo,vo],1)*1.0+mus
st[:,0]+=tick*0.9; st[:,1]+=tick*1.1
st/=max(1.0,np.abs(st).max()/0.95)
with wave.open("work/mix_pre.wav","wb") as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype('<i2').tobytes())
print("mixed")
